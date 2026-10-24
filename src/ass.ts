import { compile, type CompiledASS } from 'ass-compiler';
import { Renderer } from './renderer';
import type {
  FontFaceInfo,
  OnInitSizes,
  SubtitleFrameCallback,
  SubtitleCallbackMetadata
} from './types';
import { cleanFontName, parseFontMetrics, parseFontWeight } from './utils';
import { DebugTracker } from './debug';

export { SubtitleFrameCallback, SubtitleCallbackMetadata };
export type ASSOptions = {
  /**
   * The ass text string.
   * Can be omitted if `subUrl` is provided.
   */
  assText?: string;

  /**
   * URL to fetch the ASS content from.
   */
  subUrl?: string;

  /**
   * The video to display the subtile on.
   * Can be either an `HTMLVideoElement` or `string` (html query selector)
   */
  video: HTMLVideoElement | string;

  /**
   * List of fonts to load. This ensures that all the fonts
   * needed for the rendering are present and loaded into the document
   */
  fonts?: Font[];

  /**
   * Corresponds to the `z-index` to placed the Canvas renderer
   * > The renderer will always be added right after the `video` element
   */
  zIndex?: number;

  /**
   * A Callback that is invoked when the preprocess of the ass text by render is done
   */
  onReady?: () => void;

  /**
   * Type of logging
   * - `DEBUG` only debug type log will be displayed
   * - `DISABLE` no logging will be emitted (default)
   * - `VERBOSE` every log will be shown
   * - `WARN` only warning will be shown
   */
  logging?: LOGTYPE;

  /**
   * Should the performance be mesured ?
   */
  debug?: boolean;
  /**
   * A callback to be notified of the frames rendering
   * performance metrics.
   */
  onsubtitleFrameCallback?: SubtitleFrameCallback;
};

export type LOGTYPE = 'DISABLE' | 'VERBOSE' | 'DEBUG' | 'WARN';

export type FontStyle = {
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/FontFace/ascentOverride) */
  ascentOverride: string;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/FontFace/descentOverride) */
  descentOverride: string;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/FontFace/display) */
  display: FontDisplay;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/FontFace/family) */
  family: string;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/FontFace/featureSettings) */
  featureSettings: string;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/FontFace/lineGapOverride) */
  lineGapOverride: string;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/FontFace/stretch) */
  stretch: string;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/FontFace/style) */
  style: string;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/FontFace/unicodeRange) */
  unicodeRange: string;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/FontFace/variant) */
  variant: string;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/FontFace/weight) */
  weight: string;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/FontFace/load) */
};

export type Font = {
  family: string;
  url: string;
  descriptors?: Partial<FontStyle>;
};

/**
 * @class ASS
 *
 * ASS is an ass/ssa subtitle renderer for HTML5 video.
 *
 * It creates a wrapper around the video element and overlays a canvas
 * to draw the subtitles with high performance.
 *
 * Usage:
 * ```javascript
 * const ass = new ASS({
 *   subUrl: '/path/to/subs.ass',
 *   video: document.querySelector('video')
 * });
 * await ass.render();
 * ```
 * */
export class ASS {
  assText: string = '';
  subUrl?: string;
  private video: HTMLVideoElement | string;
  videoElement: HTMLVideoElement | null = null;
  private renderer: Renderer | null = null;
  private ro: ResizeObserver | null = null;
  private fonts?: Font[];
  private zIndex?: number;
  private onReady?: () => void;
  private debugger?: DebugTracker;
  private logging: LOGTYPE = 'DISABLE';
  private compiledAss: CompiledASS | null = null;
  // Loaded faces by each of their lowercase names (see loadFont)
  private fontFaces: Map<string, FontFaceInfo[]> = new Map();
  private readonly onFullscreenChange = () => this.setCanvasSize();
  private readonly onLoadedMetadata = () => this.setCanvasSize();

  constructor(options: ASSOptions) {
    if (options.assText) {
      this.assText = options.assText;
      this.compiledAss = compile(this.assText, {});
    }
    this.subUrl = options.subUrl;
    this.video = options.video;
    this.fonts = options.fonts;
    this.zIndex = options.zIndex;
    this.onReady = options.onReady;
    if (options.logging) this.logging = options.logging;
    if (options.debug) {
      this.debugger = new DebugTracker();
      if (options.onsubtitleFrameCallback) {
        this.debugger.onsubtitleFrameCallback = options.onsubtitleFrameCallback;
      }
    }
  }

  /**
   * Start the ass rendering process
   */
  async render() {
    if (typeof this.video == 'string') {
      this.videoElement = document.querySelector(this.video);
      if (this.videoElement === null) {
        throw new Error('Unable to find the video element');
      }
    } else {
      this.videoElement = this.video;
    }

    if (this.subUrl && !this.assText) {
      await this.fetchAss(this.subUrl);
    } else if (!this.compiledAss && this.assText) {
      this.compiledAss = compile(this.assText, {});
    }

    if (!this.compiledAss) {
      if (this.logging !== 'DISABLE') console.warn('ASS: No text to render');
      return;
    }

    const sizes = this.setCanvasSize();

    if (typeof this.fonts !== 'undefined') {
      await this.loadFonts(this.fonts);
    }

    if (this.videoElement) {
      this.initRenderer(sizes);

      this.videoElement.addEventListener('loadedmetadata', this.onLoadedMetadata);
      document.addEventListener('fullscreenchange', this.onFullscreenChange);

      this.ro = new ResizeObserver(this.setCanvasSize.bind(this));
      this.ro.observe(this.videoElement);
    }
  }

  private async fetchAss(url: string) {
    const response = await fetch(url);
    this.assText = await response.text();
    this.compiledAss = compile(this.assText, {});
  }

  private async initRenderer(sizes?: OnInitSizes) {
    if (!this.videoElement || !this.compiledAss) return;

    if (!sizes) sizes = this.setCanvasSize();

    this.renderer = new Renderer(
      this.compiledAss,
      sizes,
      this.videoElement,
      this.logging,
      this.zIndex,
      this.fontFaces,
      this.debugger
    );

    // Ensure canvas size is set correctly on init
    this.setCanvasSize();

    await this.renderer.warmup();
    if (this.onReady) {
      this.onReady();
    }

    await this.renderer.startRendering();
  }

  /**
   * Switch the ASS text content dynamically.
   * @param text The new ASS text content
   */
  async setAssText(text: string) {
    this.assText = text;
    this.compiledAss = compile(this.assText, {});

    if (this.renderer) {
      this.renderer.destroy();
      this.renderer = null;
      if (this.videoElement) {
        await this.initRenderer();
      }
    }
  }

  /**
   * Switch the ASS text content from a URL.
   * @param url The URL to fetch the ASS content from
   */
  async setSubUrl(url: string) {
    this.subUrl = url;
    await this.fetchAss(url);

    if (this.renderer) {
      this.renderer.destroy();
      this.renderer = null;
      if (this.videoElement) {
        await this.initRenderer();
      }
    }
  }

  /**
   * Stop the rendering
   */
  destroy() {
    this.videoElement?.removeEventListener('loadedmetadata', this.onLoadedMetadata);
    document.removeEventListener('fullscreenchange', this.onFullscreenChange);
    this.ro?.disconnect();

    this.renderer?.destroy();
    this.renderer = null;
  }

  private setCanvasSize() {
    const { videoWidth, videoHeight, offsetTop, offsetLeft } = this
      .videoElement as HTMLVideoElement;
    // A fullscreen video is laid out from the top-left corner of the viewport
    const fullscreen = document.fullscreenElement === this.videoElement;

    const maxWidth = this.videoElement?.clientWidth || 0;
    const maxHeight = this.videoElement?.clientHeight || 0;

    // A video that is not laid out keeps the current canvas
    if (maxWidth <= 0 || maxHeight <= 0) {
      return { width: 0, height: 0, x: 0, y: 0 } as OnInitSizes;
    }

    // Before the metadata loads, the video has no size yet: use the script's, then the element's
    const videoRatio = videoWidth && videoHeight ? videoWidth / videoHeight : 0;
    const scriptRatio =
      this.compiledAss?.width && this.compiledAss?.height
        ? this.compiledAss.width / this.compiledAss.height
        : 0;
    const aspectRatio = videoRatio || scriptRatio || maxWidth / maxHeight;

    let width = maxWidth;
    let height = maxHeight;
    let x = fullscreen ? 0 : offsetLeft;
    let y = fullscreen ? 0 : offsetTop;

    if (maxHeight * aspectRatio > maxWidth) {
      width = maxWidth;
      height = width / aspectRatio;
      y += (maxHeight - height) / 2;
    } else {
      height = maxHeight;
      width = height * aspectRatio;
      x += (maxWidth - width) / 2;
    }

    // Whole CSS pixels, so the canvas is not resampled
    width = Math.round(width);
    height = Math.round(height);
    x = Math.round(x);
    y = Math.round(y);

    const sizes = {
      width,
      height,
      x,
      y
    } as OnInitSizes;

    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;

    if (this.renderer?.renderDiv) {
      this.placeOverlay(this.renderer.renderDiv, fullscreen);
      this.renderer.renderDiv.style.width = width + 'px';
      this.renderer.renderDiv.style.height = height + 'px';
      this.renderer.renderDiv.style.top = y + 'px';
      this.renderer.renderDiv.style.left = x + 'px';
    }

    const canvasWidth = Math.round(width * dpr);
    const canvasHeight = Math.round(height * dpr);

    // Setting the size of a canvas clears it, even to the same value
    let resized = false;
    this.renderer?.layers.forEach((layer) => {
      if (layer.canvas.width !== canvasWidth || layer.canvas.height !== canvasHeight) {
        layer.canvas.width = canvasWidth;
        layer.canvas.height = canvasHeight;
        resized = true;
      }
      layer.canvas.style.width = width + 'px';
      layer.canvas.style.height = height + 'px';
      // @ts-ignore
      layer.ctx.textRendering = 'geometricPrecision';
    });
    // Paint now, or the cleared canvas shows until the next animation frame
    if (resized) this.renderer?.forceRender(this.videoElement?.currentTime ?? 0);

    return sizes;
  }

  /**
   * While the video is fullscreen, the browser paints only the video and its controls, so the
   * overlay moves to the top layer (Popover API). It has pointer-events: none, so the controls
   * still receive clicks.
   */
  private placeOverlay(overlay: HTMLDivElement, fullscreen: boolean) {
    if (!('showPopover' in overlay)) return;

    if (fullscreen && !overlay.hasAttribute('popover')) {
      overlay.setAttribute('popover', 'manual');
      overlay.showPopover();
    } else if (!fullscreen) {
      overlay.removeAttribute('popover');
    }

    overlay.style.position = fullscreen ? 'fixed' : 'absolute';
    overlay.style.right = fullscreen ? 'auto' : '';
    overlay.style.bottom = fullscreen ? 'auto' : '';
    overlay.style.border = fullscreen ? 'none' : '';
    overlay.style.background = fullscreen ? 'none' : '';
    overlay.style.transform = 'translateZ(0)';
    overlay.style.willChange = 'transform';
    overlay.style.isolation = 'isolate';
  }

  private async loadFonts(fonts: Font[]) {
    for (const font of fonts) {
      try {
        const loaded = await this.loadFont(font);
        if (loaded) {
          if (this.logging == 'VERBOSE')
            console.info(`Font ${font.family} loaded from ${font.url}`);
        } else {
          if (this.logging == 'VERBOSE' || this.logging == 'WARN')
            console.warn(`Unable to load font ${font.family} from ${font.url}`);
        }
      } catch (e) {
        if (this.logging == 'VERBOSE' || this.logging == 'WARN') {
          console.warn(`Unable to load font ${font.family} from ${font.url}`);
          console.warn(e);
        }
      }
    }
  }

  /**
   * The file is kept as an ArrayBuffer, so its metrics can be read: libass sizes text from them
   * (see `parseFontMetrics`).
   *
   * It is registered under `font.family` and under every name it declares (family, full and
   * PostScript), since libass finds fonts by those names: a script can ask for
   * "Source Sans Pro Semibold" when the file was loaded as "Source Sans Pro".
   *
   * Each face is declared with the real weight and slant of the file. Declared as `normal`, a
   * bold request makes the browser fake a bold far heavier than libass's; the renderer asks for
   * the face's own weight instead and emboldens it like libass when needed.
   * `descriptors.weight` and `descriptors.style`, when given, take precedence over the file.
   */
  private async loadFont(font: Font) {
    const response = await fetch(font.url);
    const buffer = await response.arrayBuffer();
    const metrics = parseFontMetrics(buffer);
    const explicitWeight = parseFontWeight(font.descriptors?.weight);
    const [minWeight, maxWeight] = explicitWeight ?? [metrics.weight, metrics.weight];
    const style = font.descriptors?.style ?? (metrics.italic ? 'italic' : 'normal');
    const descriptors = {
      ...font.descriptors,
      weight: font.descriptors?.weight ?? String(metrics.weight),
      style
    } as FontFaceDescriptors;

    const names: string[] = [];
    [cleanFontName(font.family), ...metrics.names].forEach((name) => {
      if (name && !names.some((n) => n.toLowerCase() === name.toLowerCase())) names.push(name);
    });

    let loaded = false;
    for (const name of names) {
      const fontFace = await new FontFace(name, buffer.slice(0), descriptors).load();
      // @ts-ignore
      document.fonts.add(fontFace);
      if (fontFace.status === 'loaded') loaded = true;

      const key = name.toLowerCase();
      const faces = this.fontFaces.get(key) ?? [];
      faces.push({
        family: name,
        minWeight,
        maxWeight,
        weightKnown: explicitWeight !== undefined || metrics.weightKnown,
        bold: metrics.bold,
        italic: style !== 'normal',
        ratio: metrics.ratio
      });
      this.fontFaces.set(key, faces);
    }
    return loaded;
  }
}

export default ASS;
