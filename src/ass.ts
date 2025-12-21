import { compile, type CompiledASS } from 'ass-compiler';
import { Renderer } from './renderer';
import type { OnInitSizes } from './types';

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
export default class ASS {
  assText: string = '';
  subUrl?: string;
  private video: HTMLVideoElement | string;
  videoElement: HTMLVideoElement | null = null;
  private renderer: Renderer | null = null;
  private ro: ResizeObserver | null = null;
  private fonts?: Font[];
  private zIndex?: number;
  private onReady?: () => void;
  private logging: LOGTYPE = 'DISABLE';
  private compiledAss: CompiledASS | null = null;

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

      this.videoElement.addEventListener('loadedmetadata', this.setCanvasSize.bind(this));

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
      this.zIndex
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
    this.videoElement?.removeEventListener('loadedmetadata', this.setCanvasSize.bind(this));
    this.ro?.disconnect();

    this.renderer?.destroy();
    this.renderer = null;
  }

  private setCanvasSize() {
    const { videoWidth, videoHeight, offsetTop, offsetLeft } = this
      .videoElement as HTMLVideoElement;
    const aspectRatio = videoWidth / videoHeight;

    const maxWidth = this.videoElement?.clientWidth || 0;
    const maxHeight = this.videoElement?.clientHeight || 0;

    let width = maxWidth;
    let height = maxHeight;
    let x = offsetLeft;
    let y = offsetTop;

    if (maxHeight * aspectRatio > maxWidth) {
      width = maxWidth;
      height = width / aspectRatio;
      y += (maxHeight - height) / 2;
    } else {
      height = maxHeight;
      width = height * aspectRatio;
      x += (maxWidth - width) / 2;
    }

    const sizes = {
      width,
      height,
      x,
      y
    } as OnInitSizes;

    if (this.renderer?.renderDiv) {
      this.renderer.renderDiv.style.width = width + 'px';
      this.renderer.renderDiv.style.height = height + 'px';
      this.renderer.renderDiv.style.top = y + 'px';
      this.renderer.renderDiv.style.left = x + 'px';
    }

    this.renderer?.layers.forEach((layer) => {
      layer.canvas.width = width;
      layer.canvas.height = height;
    });

    return sizes;
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

  private async getFontUrl(fontUrl: string) {
    const response = await fetch(fontUrl);
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  }

  private async loadFont(font: Font) {
    const url = await this.getFontUrl(font.url);
    const fontFace = new FontFace(font.family, `url(${url})`, font.descriptors || {});
    const loadedFace = await fontFace.load();
    // @ts-ignore
    document.fonts.add(loadedFace);
    return fontFace.status === 'loaded';
  }
}
