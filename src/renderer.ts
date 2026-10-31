import type { CompiledASS, CompiledASSStyle, Dialogue, DialogueSlice } from 'ass-compiler';
import type { CompiledTag } from 'ass-compiler/types/tags';

import type {
  StyleDescriptor,
  Styles,
  Position,
  OnInitSizes,
  Layer,
  Margin,
  Char,
  Word,
  FadeAnimation,
  CustomAnimation,
  Karaoke,
  Drawing,
  Clip,
  Rect,
  FontFaceInfo,
  Bitmap,
  LayerCanvas,
  LayerContext,
  PlayheadSource
} from './types';
import { CHARKIND, LOGTYPE, Align, Baseline, FadeKind } from './types';
import {
  ruleOfThree,
  convertAegisubColorToHex,
  swapBBGGRR,
  newCanvas,
  newRender,
  createScratchCanvas,
  Vector2,
  stringHash,
  chunkCharWidth,
  chunkCharToString,
  vectorLerp,
  getOpacity,
  getOpacityComplex,
  lerp,
  parseAlpha,
  interpolateColor,
  cleanFontName,
  stripWeightSuffix,
  assWeight,
  buildDrawingPath,
  blurMask,
  expandMask,
  halveMask,
  placeMask,
  reduceAlpha,
  assProjection,
  projectPoint,
  invertProjection
} from './utils';
import type { ProjectionMatrix } from './utils';
import { DebugTracker } from './debug';

type PreProceesedAss = {
  start: number;
  layer: number;
  end: number;
  style: string;
  margin: Margin;
  pos?: Position;
  move?: MoveAnimation;
  fade?: FadeAnimation;
  rotationOrigin?: Vector2;
  alignment: number;
  chars: Char[];
  clip?: Clip;
  q: number;
  animated: boolean;
  index: number; // script order: stable id, and draw order within a layer
};

// Style of one glyph or drawing for the current frame, with its hash for grouping runs.
type ResolvedChar = { font: StyleDescriptor; hash: number };

type DrawingChar = Extract<Char, { kind: CHARKIND.DRAWING }>;

// Face drawn for a style, see resolveFace. `family` is null for fonts that were not loaded.
type ResolvedFace = { family: string | null; weight: number; embolden: boolean; ratio: number };

// Coverage of a word, from 0 to 255 per output pixel, without its colors and fades. `x` and `y`
// place its top left corner on the canvas.
type WordMasks = {
  fill: Bitmap;
  border?: Bitmap;
  shadow?: Bitmap;
  font: StyleDescriptor;
  // Part of the fill karaoke has not reached yet, in the secondary color
  secondary?: Bitmap;
  transform?: {
    origin: { x: number; y: number };
    frz: number;
  };
};

type MoveAnimation = {
  // x1: number;
  // y1: number;
  from: Vector2;
  // x2: number;
  //y2: number;
  to: Vector2;
  // t1: number;
  start: number;
  //t2: number;
  end: number;
};

const MAX_CACHE_BYTES = 4 * 1024 * 1024;
const MAX_CACHE_ENTRIES = 512;
const MAX_SCRATCH_CANVAS_PIXELS = 4 * 1024 * 1024;
const MAX_RASTER_PIXELS = 16 * 1024 * 1024;

export class Renderer {
  private compiledASS: CompiledASS;
  renderDiv: HTMLDivElement | null;
  layers: Layer[];
  private video: HTMLVideoElement | PlayheadSource;
  private playerResX: number;
  private playerResY: number;
  private stop: boolean = false;
  private animationHandle: number | null = null;
  private _log: LOGTYPE;
  private ppass: PreProceesedAss[] = [];
  private styles: Styles;
  // private previous = 0;
  currentTime = 0;
  private occupiedRects: Map<number, Rect[]> = new Map();
  private lastStateHash: string | null = null;
  // Faces of the loaded fonts, by each of their lowercase names (see `ASS.loadFont`)
  private fonts: Map<string, FontFaceInfo[]>;
  private faceCache = new Map<string, ResolvedFace>();
  // Dialogues on screen, see getSlices
  private byStart: PreProceesedAss[] = [];
  private nextStart = 0;
  private selected: PreProceesedAss[] = [];
  private selectedTime: number | null = null;
  private measureCache = new Map<string, TextMetrics>();
  // Glyph coverage by font, text, scale and subpixel position, in order of use (see glyphBitmap)
  private glyphCache = new Map<string, Bitmap>();
  private glyphCacheSize = 0;
  // Blurred and projected masks of the words that did not move, see drawWord
  private filteredMaskCache = new Map<
    string,
    { fill: Bitmap; border?: Bitmap; penX: number; penY: number }
  >();
  private filteredMaskCacheSize = 0;
  private paintedMaskCache = new WeakMap<
    Uint8ClampedArray,
    { canvas: LayerCanvas; color: string; alpha: number }
  >();
  private glyphIds = new WeakMap<Bitmap, number>();
  private nextGlyphId = 0;
  private paintCanvas = createScratchCanvas();
  private paintImageData?: ImageData;
  private texelBuffer = new Uint8ClampedArray(256 * 4);
  private texelWords = new Uint32Array(this.texelBuffer.buffer);
  private glyphContext?: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  // Media time of the video frame on screen (requestVideoFrameCallback); null from a seek until
  // its frame is shown, and where the browser has no such callback.
  private frameTime: number | null = null;
  private frameHandle: number | null = null;
  private lastSyncVideoTime = 0;
  private lastSyncTimestamp = 0;
  private readonly onSeeking = () => {
    this.frameTime = null;
    this.lastSyncTimestamp = 0;
    this.invalidate();
  };

  private latestVideoMetadata: VideoFrameCallbackMetadata | null = null;

  private readonly onVideoFrame = (_now: number, metadata: VideoFrameCallbackMetadata) => {
    this.frameTime = metadata.mediaTime;
    this.latestVideoMetadata = metadata;
    if (this.video.requestVideoFrameCallback) {
      this.frameHandle = this.video.requestVideoFrameCallback(this.onVideoFrame);
    }
  };
  private hasAnimated = false;
  private drawingPaths = new WeakMap<Drawing, { x: number; y: number; path: Path2D }>();
  debug?: DebugTracker;

  timeOffset: number;

  constructor(
    ass: CompiledASS,
    sizes: OnInitSizes,
    video: HTMLVideoElement | PlayheadSource,
    log: LOGTYPE,
    zIndex?: number,
    fonts: Map<string, FontFaceInfo[]> = new Map(),
    debug?: DebugTracker,
    timeOffset: number = 0,
    canvas?: LayerCanvas
  ) {
    this.timeOffset = timeOffset;
    this.debug = debug;
    this._log = log;
    this.compiledASS = ass;
    this.styles = ass.styles;
    this.fonts = fonts;
    if (this._log === 'DEBUG') {
      this.log('DEBUG', this.compiledASS);
    }
    // ass-compiler gives null for a missing PlayRes. Fill it in as libass does.
    const { width, height } = this.compiledASS;
    if (!width && !height) {
      this.playerResX = 384;
      this.playerResY = 288;
    } else if (!height) {
      this.playerResX = width;
      this.playerResY = width === 1280 ? 1024 : Math.max(1, Math.floor((width * 3) / 4));
    } else if (!width) {
      this.playerResX = height === 1024 ? 1280 : Math.max(1, Math.floor((height * 4) / 3));
      this.playerResY = height;
    } else {
      this.playerResX = width;
      this.playerResY = height;
    }
    if (canvas) {
      const ctx = canvas.getContext('2d') as LayerContext;
      if (ctx === null) {
        throw new Error('Unable to initialize the Canvas 2D context');
      }
      //@ts-ignore
      ctx.textRendering = 'geometricPrecision';
      this.layers = [
        {
          canvas,
          ctx
        }
      ];
      this.renderDiv = null;
    } else {
      this.renderDiv = newRender(
        sizes.y,
        sizes.x,
        sizes.width,
        sizes.height,
        zIndex,
        video as HTMLElement
      );
      // Every ASS layer is drawn on this one canvas, lower layers first (see display)
      const c = newCanvas(sizes.width, sizes.height, 0, 'subtitles', this.renderDiv);
      const ctx = c.getContext('2d') as CanvasRenderingContext2D;
      if (ctx === null) {
        throw new Error('Unable to initialize the Canvas 2D context');
      }
      //@ts-ignore
      ctx.textRendering = 'geometricPrecision';
      this.layers = [
        {
          canvas: c,
          ctx
        }
      ];
    }
    this.video = video;
  }

  async warmup() {
    const { dialogues } = this.compiledASS;

    for (let i = 0; i < dialogues.length; i++) {
      const dia = dialogues[i] as Dialogue;
      const { layer, alignment, start, end, style, margin, slices, pos, move, org, fade, q } = dia;
      const clip = (dia as any).clip as Clip | undefined;
      let movAnim: MoveAnimation | undefined;
      let rotOrg: Vector2 | undefined;
      let fadeAnim: FadeAnimation | undefined;

      if (move) {
        movAnim = {
          from: new Vector2(move.x1, move.y1),
          to: new Vector2(move.x2, move.y2),
          start: move.t1,
          end: move.t2
        };
      }

      if (org) {
        rotOrg = new Vector2(org.x, org.y);
      }

      if (fade) {
        switch (fade.type) {
          case 'fad':
            fadeAnim = { type: FadeKind.Simple, fadein: fade.t1, fadeout: fade.t2 };
            break;
          case 'fade':
            let { a1, a2, a3, t1, t2, t3, t4 } = fade;
            fadeAnim = { type: FadeKind.Complex, a1, a2, a3, t1, t2, t3, t4 };
            break;
        }
      }

      const chars = this.processSlices(slices);
      const isAnimated =
        !!(movAnim || fadeAnim) ||
        chars.some(
          (c) =>
            (c.kind === CHARKIND.NORMAL && (!!c.tag.t || !!c.karaoke)) ||
            (c.kind === CHARKIND.DRAWING && !!c.tag.t)
        );

      this.ppass.push({
        index: this.ppass.length,
        start,
        layer,
        end,
        style,
        margin,
        alignment,
        pos,
        move: movAnim,
        fade: fadeAnim,
        rotationOrigin: rotOrg,
        chars,
        clip,
        q,
        animated: isAnimated
      });
    }

    this.byStart = [...this.ppass].sort((a, b) => a.start - b.start || a.index - b.index);
    this.selected = [];
    this.selectedTime = null;
    this.nextStart = 0;
  }

  private processSlices(slices: DialogueSlice[]): Char[] {
    let chars: Char[] = [];
    let currentKaraokeTime = 0;
    slices.forEach((slice) => {
      const { style, fragments } = slice;

      let _frag: Char[] = [];

      fragments.forEach((frag) => {
        // Karaoke Logic
        const tag = frag.tag as any;
        let kMode: 'k' | 'kf' | 'ko' | 'K' | null = null;
        let kVal = 0;
        if (tag.k !== undefined) {
          kMode = 'k';
          kVal = tag.k;
        } else if (tag.kf !== undefined) {
          kMode = 'kf';
          kVal = tag.kf;
        } else if (tag.ko !== undefined) {
          kMode = 'ko';
          kVal = tag.ko;
        } else if (tag.K !== undefined) {
          kMode = 'K';
          kVal = tag.K;
        }

        let karaoke: Karaoke | undefined;
        if (kMode !== null) {
          karaoke = {
            type: kMode,
            start: currentKaraokeTime,
            end: currentKaraokeTime + kVal / 100
          };
          currentKaraokeTime += kVal / 100;
        }

        //@ts-ignore
        const text = frag.text.replaceAll('\\N', '\n').replaceAll('\\h', '\u00A0').split('');
        const drawing = (frag as any).drawing as Drawing | undefined;

        let ord = 0;
        let chars: Char[] = [];

        if (drawing) {
          const scale = (frag.tag as any).p || 0;
          // If scale is 0, it's not a drawing (usually disabled), but if drawing object exists, it might be.
          // However, ass-compiler usually returns drawing object only if valid.
          // But p0 disables drawing. So check scale != 0.
          if (scale > 0) {
            chars.push({
              kind: CHARKIND.DRAWING,
              pos: new Vector2(),
              w: 0, // set on every frame from the style, see drawingBox
              tag: frag.tag,
              style,
              drawing,
              scale
            });
          }
        } else {
          for (let i = 0; i < text.length; i++) {
            const char = text[i] as string;
            if (char == '\n') {
              chars.push({
                kind: CHARKIND.NEWLINE
              });
              ord = 0;
            } else {
              chars.push({
                kind: CHARKIND.NORMAL,
                pos: new Vector2(),
                c: char,
                ord,
                w: 0,
                style,
                tag: frag.tag,
                karaoke
              });

              ord += 1;
            }
          }
        }

        _frag = _frag.concat(chars);
      });

      chars = chars.concat(_frag);
    });

    return chars;
  }

  private sublog(type: LOGTYPE, ...message: any) {
    switch (type) {
      case 'DISABLE':
        break;
      case 'VERBOSE':
        console.info(type, ...message);
        break;
      case 'DEBUG':
        console.debug(type, ...message);
        break;
      case 'WARN':
        console.warn(type, ...message);
        break;
    }
  }

  private log(type: LOGTYPE, ...message: any) {
    switch (this._log) {
      case 'DISABLE':
        break;
      case 'VERBOSE':
        this.sublog(type, message);
        break;
      case 'DEBUG':
        if (type == 'DEBUG') {
          this.sublog(type, message);
        }
        break;
      case 'WARN':
        if (type == 'WARN') {
          this.sublog(type, message);
        }
        break;
    }
  }

  async startRendering() {
    if (
      'requestVideoFrameCallback' in this.video &&
      typeof this.video.requestVideoFrameCallback === 'function'
    ) {
      this.video.addEventListener?.('seeking', this.onSeeking);
      this.frameHandle = this.video.requestVideoFrameCallback(this.onVideoFrame);
    }
    requestAnimationFrame((_timestamp) => {
      // this.previous = timestamp;
      this.animationHandle = requestAnimationFrame(this.render.bind(this));
    });
  }

  private render(timestamp: number) {
    if (this.stop === true) {
      if (this.animationHandle) {
        this.renderDiv?.remove();
        (typeof window !== 'undefined' ? window.cancelAnimationFrame : cancelAnimationFrame)(
          this.animationHandle
        );
      }
    } else {
      // Subtitles only change with the video frame on screen for static text, but animations
      // (e.g. rotations, moves) update smoothly on every display refresh using continuous rAF interpolation.
      const playing = !this.video.paused;
      const currentTime = this.video.currentTime;

      // Handle video loop or backward seek: when playback wraps back, reset stale frames and invalidate
      if (currentTime < this.lastSyncVideoTime - 0.2) {
        this.frameTime = null;
        this.lastSyncTimestamp = 0;
        this.invalidate();
      }

      let time: number;
      if (playing && this.hasAnimated) {
        if (
          currentTime !== this.lastSyncVideoTime ||
          this.lastSyncTimestamp === 0 ||
          Math.abs(timestamp - this.lastSyncTimestamp) > 500
        ) {
          this.lastSyncVideoTime = currentTime;
          this.lastSyncTimestamp = timestamp;
          time = currentTime;
        } else {
          const rate = this.video.playbackRate || 1.0;
          const elapsed = ((timestamp - this.lastSyncTimestamp) / 1000) * rate;
          time = this.lastSyncVideoTime + Math.min(Math.max(0, elapsed), 0.1);
        }
      } else {
        this.lastSyncVideoTime = currentTime;
        this.lastSyncTimestamp = timestamp;
        time = this.frameTime ?? currentTime;
      }
      this.debug?.startFrame();
      this.display(time);
      const now = performance.now();
      this.debug?.endFrame(now, {
        mediaTime: time,
        expectedDisplayTime: this.latestVideoMetadata?.expectedDisplayTime ?? now,
        width: this.latestVideoMetadata?.width ?? this.video.videoWidth,
        height: this.latestVideoMetadata?.height ?? this.video.videoHeight,
        isAnimated: this.hasAnimated
      });
      this.animationHandle = requestAnimationFrame(this.render.bind(this));
    }
  }

  destroy() {
    this.stop = true;
    // Remove the overlay now, not on the next frame: a hidden tab gets no frames
    if (this.animationHandle) {
      (typeof window !== 'undefined' ? window.cancelAnimationFrame : cancelAnimationFrame)(
        this.animationHandle
      );
    }
    if (typeof this.video.removeEventListener === 'function') {
      this.video.removeEventListener('seeking', this.onSeeking);
    }
    if (this.frameHandle !== null && typeof this.video.cancelVideoFrameCallback === 'function') {
      this.video.cancelVideoFrameCallback(this.frameHandle);
    }
    this.renderDiv?.remove();
  }

  /** Paints the frame at `time` now, instead of on the next animation frame */
  forceRender(time = this.video.currentTime) {
    this.invalidate();
    this.display(time);
  }

  private display(time: number) {
    this.currentTime = time;
    const slicesToDisplay = this.getSlices(time);

    // The canvas is painted again when the dialogues on screen change, or on every frame while
    // one of them is animated
    const hasAnimated = slicesToDisplay.some((d) => d.animated);
    this.hasAnimated = hasAnimated;
    const dialogueIds = slicesToDisplay.map((d) => d.index).join(',');
    const stateHash = hasAnimated ? `animated-${time}` : `static-${dialogueIds}`;
    if (stateHash === this.lastStateHash) return;
    this.lastStateHash = stateHash;

    this.clear();
    this.occupiedRects.clear(); // collision rects, per layer
    slicesToDisplay.forEach((d) => this.showDialogue(d, time));
  }

  // private charsToString(chars: Char[]): string {
  //   return chars.reduce((acc, v) => {
  //     if (v.kind === CHARKIND.NEWLINE) return acc + '\n';
  //     if (v.kind === CHARKIND.NORMAL) return acc + v.c;
  //     return acc;
  //   }, '');
  // }

  // Dialogues on screen at `time`, in layer order, then script order within a layer.
  // An event is shown from its start up to, not including, its end, as in libass.
  // Playback moves forward, so the set only follows the events that start or end since the last
  // frame instead of scanning the whole script. Seeking back rebuilds it.
  private getSlices(rawtime: number): PreProceesedAss[] {
    const time = rawtime + this.timeOffset;
    let changed = false;
    if (this.selectedTime === null || time < this.selectedTime) {
      this.selected = this.byStart.filter((d) => d.start <= time && time < d.end);
      this.nextStart = this.byStart.findIndex((d) => d.start > time);
      if (this.nextStart === -1) this.nextStart = this.byStart.length;
      changed = true;
    } else {
      while (this.nextStart < this.byStart.length && this.byStart[this.nextStart]!.start <= time) {
        this.selected.push(this.byStart[this.nextStart]!);
        this.nextStart++;
        changed = true;
      }
      const alive = this.selected.filter((d) => time < d.end);
      if (alive.length !== this.selected.length) changed = true;
      this.selected = alive;
    }
    this.selectedTime = time;
    if (changed) this.selected.sort((a, b) => a.layer - b.layer || a.index - b.index);
    return this.selected;
  }

  // Style of every glyph and drawing, resolved once per frame with its \t transforms, so wrapping,
  // widths, metrics and painting all see the animated values. The glyphs of one fragment share
  // their tag and style, so they share one resolved style too.
  private resolveChars(d: PreProceesedAss, layer: Layer, time: number): Map<Char, ResolvedChar> {
    const resolved = new Map<Char, ResolvedChar>();
    let last: { tag: CompiledTag; style: string; run: ResolvedChar } | null = null;
    d.chars.forEach((char) => {
      if (char.kind === CHARKIND.NEWLINE) return;
      if (last === null || last.tag !== char.tag || last.style !== char.style) {
        const font = this.computeStyle(char.style, d.alignment, layer);
        this.applyOverrideTag(char.tag, font);
        this.applyTransforms(font, time, d.start);
        last = { tag: char.tag, style: char.style, run: { font, hash: this.getFontHash(font) } };
      }
      resolved.set(char, last.run);
    });
    return resolved;
  }

  // \t transforms at `time`, in order. Each one goes from the value before it to its target, and
  // holds the target after its end, as in libass.
  private applyTransforms(font: StyleDescriptor, time: number, startTime: number) {
    const cur = time * 1000;
    font.customAnimations.forEach((ca: CustomAnimation) => {
      const start = startTime * 1000 + ca.t1;
      const end = startTime * 1000 + ca.t2;
      if (cur < start) return;
      let t = end <= start ? 1 : Math.min(1, (cur - start) / (end - start));
      if (ca.accel !== 1) t = Math.pow(t, ca.accel);
      const tag = ca.tag as any;

      for (const field in tag) {
        switch (field) {
          case 'a1':
          case 'a2':
          case 'a3':
          case 'a4':
            font.colors[field] = Math.round(lerp(font.colors[field], parseAlpha(tag[field]), t));
            break;
          case 'c1':
          case 'c2':
          case 'c3':
          case 'c4':
            font.colors[field] = interpolateColor(font.colors[field], swapBBGGRR(tag[field]), t);
            break;
          case 'blur':
          case 'be':
          case 'xshad':
          case 'yshad':
          case 'xbord':
          case 'ybord':
            font[field] = lerp(font[field], tag[field], t);
            break;
          case 'fax':
          case 'fay':
          case 'frx':
          case 'fry':
          case 'frz':
            font.t[field] = lerp(font.t[field] ?? 0, tag[field], t);
            break;
          case 'fscx':
          case 'fscy':
            font.t[field] = lerp(font.t[field] ?? 100, tag[field], t);
            break;
          case 'fs':
            font.scriptSize = lerp(font.scriptSize, tag.fs, t);
            font.fontsize = this.upscaleFontSize(font.scriptSize, font);
            break;
          case 'fsp':
            font.t.fsp = lerp(
              font.t.fsp ?? 0,
              this.upscale(tag.fsp, this.playerResX, this.layers[0]?.canvas.width || 0),
              t
            );
            break;
          default:
            break;
        }
      }
    });
  }

  // measureText runs for every glyph of every frame, and the same runs repeat. Results are kept
  // until the canvas is invalidated.
  private measure(ctx: LayerContext, text: string): TextMetrics {
    const key = `${ctx.font}|${ctx.letterSpacing}|${ctx.fontKerning}|${text}`;
    let metrics = this.measureCache.get(key);
    if (metrics === undefined) {
      // Animated sizes make a new font string on every frame, so the cache is bounded
      if (this.measureCache.size >= 4096) this.measureCache.clear();
      metrics = ctx.measureText(text);
      this.measureCache.set(key, metrics);
    }
    return metrics;
  }

  private getLineMetrics(layer: Layer, lines: Char[][], resolved: Map<Char, ResolvedChar>) {
    return lines.map((line) => {
      let maxAscent = 0;
      let maxDescent = 0;

      line.forEach((char) => {
        if (char.kind === CHARKIND.NORMAL) {
          const font = resolved.get(char)!.font;
          this.applyFont(font, layer);

          const m = this.measure(layer.ctx, char.c);
          const sy = this.textScale(font).y;
          const ascent = m.fontBoundingBoxAscent * sy;
          const descent = m.fontBoundingBoxDescent * sy;
          if (ascent > maxAscent) maxAscent = ascent;
          if (descent > maxDescent) maxDescent = descent;
        } else if (char.kind === CHARKIND.DRAWING) {
          const { h } = this.drawingBox(char, resolved.get(char)!.font, layer);
          if (h > maxAscent) maxAscent = h;
        }
      });

      return {
        ascent: maxAscent,
        height: maxAscent + maxDescent
      };
    });
  }

  private measureChar(layer: Layer, char: Char, resolved: Map<Char, ResolvedChar>): number {
    if (char.kind === CHARKIND.NORMAL) {
      const font = resolved.get(char)!.font;
      this.applyFont(font, layer);
      return this.measure(layer.ctx, char.c).width * this.textScale(font).x;
    } else if (char.kind === CHARKIND.DRAWING) {
      return this.drawingBox(char, resolved.get(char)!.font, layer).w;
    }
    return 0;
  }

  // \fscx and \fscy as factors. They are part of the layout, like the font size. The tilts are
  // not: they are applied around the rotation origin when painting, see drawWord.
  private textScale(font: StyleDescriptor) {
    return { x: font.t.fscx / 100, y: font.t.fscy / 100 };
  }

  // Scale from drawing units to output pixels: \p, \fscx and \fscy. Layout and painting both use
  // it, so a drawing is never laid out at one size and painted at another.
  private drawingScale(char: DrawingChar, font: StyleDescriptor, layer: Layer) {
    const scale = this.textScale(font);
    const pScale = Math.pow(2, -(char.scale - 1));
    return {
      x: scale.x * pScale * (layer.canvas.width / this.playerResX),
      y: scale.y * pScale * (layer.canvas.height / this.playerResY)
    };
  }

  // Advance (w) and ascent (h) of a drawing in output pixels
  private drawingBox(char: DrawingChar, font: StyleDescriptor, layer: Layer) {
    const scale = this.drawingScale(char, font, layer);
    return {
      w: Math.abs(scale.x) * char.drawing.width,
      h: Math.abs(scale.y) * char.drawing.height
    };
  }

  // Outline of a drawing for the last scale it was built at. Rotation and position are not part
  // of it, so it only changes when the size changes.
  private drawingPath(drawing: Drawing, sx: number, sy: number): Path2D {
    const cached = this.drawingPaths.get(drawing);
    if (cached && cached.x === sx && cached.y === sy) return cached.path;
    const path = buildDrawingPath(drawing.instructions, sx, sy);
    this.drawingPaths.set(drawing, { x: sx, y: sy, path });
    return path;
  }

  private lineWidth(layer: Layer, chars: Char[], resolved: Map<Char, ResolvedChar>) {
    let w = 0;
    chars.forEach((char) => {
      w += this.measureChar(layer, char, resolved);
    });

    return w;
  }

  private lines(
    chars: Char[],
    layer: Layer,
    q: number,
    maxWidth: number,
    resolved: Map<Char, ResolvedChar>
  ): Char[][] {
    let lines: Char[][] = [];
    let currentLine: Char[] = [];
    let currentLineWidth = 0;

    // q2: No wrapping (except \N)
    if (q === 2) {
      chars.forEach((char) => {
        if (char.kind === CHARKIND.NEWLINE) {
          lines.push(currentLine);
          currentLine = [];
        } else {
          currentLine.push(char);
        }
      });
      if (currentLine.length > 0) lines.push(currentLine);
      return lines;
    }

    // q0, q1, q3: Greedy wrapping
    let lastSafeBreakIndex = -1;

    for (let i = 0; i < chars.length; i++) {
      const char = chars[i]!;

      if (char.kind === CHARKIND.NEWLINE) {
        lines.push(currentLine);
        currentLine = [];
        currentLineWidth = 0;
        lastSafeBreakIndex = -1;
        continue;
      }

      const charWidth = this.measureChar(layer, char, resolved);

      // Check if we need to wrap
      if (currentLineWidth + charWidth > maxWidth && currentLine.length > 0) {
        if (lastSafeBreakIndex !== -1) {
          // Break at the last space
          const line1 = currentLine.slice(0, lastSafeBreakIndex + 1);
          const overflowChars = currentLine.slice(lastSafeBreakIndex + 1);

          lines.push(line1);

          currentLine = overflowChars;
          // Recalculate width for the new line start
          currentLineWidth = this.lineWidth(layer, currentLine, resolved);
          lastSafeBreakIndex = -1;
        } else {
          // No break point found
          // Standard ASS behavior for q1 is to overflow if a single word is too long.
        }
      }

      currentLine.push(char);
      currentLineWidth += charWidth;

      if (char.kind === CHARKIND.NORMAL && char.c === ' ') {
        lastSafeBreakIndex = currentLine.length - 1;
      }
    }

    if (currentLine.length > 0) {
      lines.push(currentLine);
    }

    return lines;
  }

  private showDialogue(d: PreProceesedAss, time: number) {
    const layer = this.layers[0];
    if (!layer) return;

    layer.ctx.save();
    if (d.clip) {
      let activeClip = d.clip;
      for (const char of d.chars) {
        if (char.kind !== CHARKIND.NEWLINE && char.tag.t) {
          for (const anim of char.tag.t) {
            if ((anim.tag as any).clip) {
              const start = d.start * 1000 + anim.t1;
              const end = d.start * 1000 + anim.t2;
              const cur = time * 1000;
              if (cur < start) continue;
              // After its end, a transform holds its target
              let t = end <= start ? 1 : Math.min(1, (cur - start) / (end - start));
              if (anim.accel !== 1) t = Math.pow(t, anim.accel);

              activeClip = this.interpolateClip(d.clip, (anim.tag as any).clip as Clip, t);
              break;
            }
          }
        }
      }
      this.applyClip(activeClip, layer);
    }

    let font = this.computeStyle(d.style, d.alignment, layer);

    const margin = this.upscaleMargin(d.margin);
    const maxWidth = layer.canvas.width - margin.left - margin.right;

    const resolved = this.resolveChars(d, layer, time);
    const lines = this.lines(d.chars, layer, d.q, maxWidth, resolved);
    const lineMetrics = this.getLineMetrics(layer, lines, resolved);
    const totalHeight = lineMetrics.reduce((acc, m) => acc + m.height, 0);

    let cX = 0;
    let cY = 0;
    let baseX = 0;
    let currentOpacity = 1;

    let customPosition = false;
    let rotationOrigin: Vector2 | undefined;
    const Xratio = layer.canvas.width / this.playerResX;
    const Yratio = layer.canvas.height / this.playerResY;

    if (d.pos) {
      customPosition = true;
      baseX = d.pos.x * Xratio;
      cX = baseX;
      cY = d.pos.y * Yratio;
    }

    if (d.move) {
      customPosition = true;

      let startPosition = new Vector2(d.move.from.x * Xratio, d.move.from.y * Yratio);
      let endPosition = new Vector2(d.move.to.x * Xratio, d.move.to.y * Yratio);
      // t1 and t2 count from the start of the event. Both 0 (or left out) mean the whole event.
      let t1 = d.move.start;
      let t2 = d.move.end;
      if (t1 <= 0 && t2 <= 0) {
        t1 = 0;
        t2 = (d.end - d.start) * 1000;
      }
      const elapsed = (time - d.start) * 1000;
      let progress = 1;
      if (elapsed <= t1) progress = 0;
      else if (elapsed < t2) progress = (elapsed - t1) / (t2 - t1);
      let actualPosition = vectorLerp(startPosition, endPosition, progress);

      baseX = actualPosition.x;
      cX = baseX;
      cY = actualPosition.y;
    }

    if (d.rotationOrigin) {
      rotationOrigin = new Vector2(d.rotationOrigin.x * Xratio, d.rotationOrigin.y * Yratio);
    } else {
      // Default origin is the anchor point
      let defaultOriginX = baseX;
      let defaultOriginY = cY;

      if (!customPosition) {
        // Alignment-based anchor on screen
        if (font.textAlign === Align.Left) defaultOriginX = margin.left;
        else if (font.textAlign === Align.Center) defaultOriginX = layer.canvas.width / 2;
        else if (font.textAlign === Align.Right) defaultOriginX = layer.canvas.width - margin.right;

        if (font.textBaseline === Baseline.Top) defaultOriginY = margin.vertical;
        else if (font.textBaseline === Baseline.Middle) defaultOriginY = layer.canvas.height / 2;
        else if (font.textBaseline === Baseline.Bottom)
          defaultOriginY = layer.canvas.height - margin.vertical;
      }
      rotationOrigin = new Vector2(defaultOriginX, defaultOriginY);
    }

    if (d.fade) {
      switch (d.fade.type) {
        case FadeKind.Simple:
          currentOpacity = getOpacity(d.fade, d.start * 1000, d.end * 1000, time * 1000);
          break;
        case FadeKind.Complex:
          currentOpacity = getOpacityComplex(d.fade, d.start * 1000, d.end * 1000, time * 1000);
          break;
      }
    }

    let offsetY = 0; // vertical offset based on Alignment (Top/Middle/Bottom)
    if (!customPosition) {
      switch (font.textBaseline) {
        case Baseline.Bottom:
          // Shift UP from bottom: CanvasHeight - Margin - TotalHeight
          offsetY = layer.canvas.height - margin.vertical - totalHeight;
          break;
        case Baseline.Middle:
          // Shift to Middle: (CanvasHeight/2) - (TotalHeight/2)
          offsetY = (layer.canvas.height - totalHeight) / 2;
          break;
        case Baseline.Top:
          // Shift Down: Margin
          offsetY = margin.vertical;
          break;
        default:
          offsetY = layer.canvas.height - margin.vertical - totalHeight;
          break;
      }

      // Collision Resolution
      const layerRects = this.occupiedRects.get(d.layer) || [];
      const rect: Rect = {
        x: margin.left,
        y: offsetY,
        w: layer.canvas.width - margin.left - margin.right,
        h: totalHeight
      };

      const direction = font.textBaseline === Baseline.Top ? 1 : -1;
      let collision = true;
      while (collision) {
        collision = false;
        for (const other of layerRects) {
          if (this.intersects(rect, other)) {
            collision = true;
            break;
          }
        }
        if (collision) {
          rect.y += direction;
        }
      }
      offsetY = rect.y;
      layerRects.push(rect);
      this.occupiedRects.set(d.layer, layerRects);
    } else {
      switch (font.textBaseline) {
        case Baseline.Bottom:
          offsetY = -totalHeight;
          break;
        case Baseline.Middle:
          offsetY = -totalHeight / 2;
          break;
        default:
          offsetY = 0;
          break;
      }
    }

    let words: Word[] = [];

    lines.forEach((line, lineIdx) => {
      const lineWidth = this.lineWidth(layer, line, resolved);
      let offsetX = 0;

      if (!customPosition) {
        switch (font.textAlign) {
          case Align.Left:
            offsetX = margin.left;
            break;
          case Align.Center:
            offsetX = (layer.canvas.width - lineWidth) / 2;
            break;
          case Align.Right:
            offsetX = layer.canvas.width - lineWidth - margin.right;
            break;
          default:
            offsetX = margin.left;
        }
      } else {
        switch (font.textAlign) {
          case Align.Center:
            offsetX = -lineWidth / 2;
            break;
          case Align.Right:
            offsetX = -lineWidth;
            break;
          default:
            offsetX = 0;
            break;
        }
      }

      cX = baseX + offsetX;

      const metrics = lineMetrics[lineIdx]!;
      let lineY = cY + offsetY;

      // We need to accumulate height of previous lines to find current line top.
      for (let i = 0; i < lineIdx; i++) {
        lineY += lineMetrics[i]!.height;
      }
      // lineY is now the TOP of the current line box.
      // Baseline is lineY + ascent.
      const baseline = lineY + metrics.ascent;

      let currentWord: Char[] = [];
      let currentFont: StyleDescriptor | null = null;
      let currentHash = 0;

      line.forEach((char) => {
        let charWidth = 0;

        if (char.kind === CHARKIND.NORMAL) {
          char.pos.x = cX;
          char.pos.y = baseline;

          font = resolved.get(char)!.font;
          charWidth = this.measureChar(layer, char, resolved);

          char.w = charWidth;
        } else if (char.kind === CHARKIND.DRAWING) {
          char.pos.x = cX;

          font = resolved.get(char)!.font;
          const box = this.drawingBox(char, font, layer);
          charWidth = box.w;

          char.pos.y = baseline - box.h;
          char.w = charWidth;
        }

        cX += charWidth;

        // Word Grouping (per line). A drawing is a word of its own: it is painted from its path,
        // so text or another drawing grouped with it would be lost.
        if (char.kind == CHARKIND.NORMAL || char.kind == CHARKIND.DRAWING) {
          const fHash = resolved.get(char)!.hash;
          const head = currentWord[0];
          if (
            head &&
            currentFont !== null &&
            (currentHash !== fHash ||
              char.kind === CHARKIND.DRAWING ||
              head.kind === CHARKIND.DRAWING)
          ) {
            words.push({ font: currentFont, value: currentWord, w: chunkCharWidth(currentWord) });
            currentWord = [];
          }
          currentFont = font;
          currentWord.push(char);
          currentHash = fHash;
        }
      });

      // Flush last word of line
      if (currentWord.length > 0 && currentFont !== null) {
        words.push({
          font: currentFont,
          value: currentWord,
          w: chunkCharWidth(currentWord)
        });
      }
    });

    const masks: WordMasks[] = [];
    words.forEach((word) => {
      word.font.opacity = currentOpacity;
      // Nothing would be painted (faded out, or every color fully transparent)
      const { a1, a2, a3, a4 } = word.font.colors;
      if (currentOpacity <= 0 || Math.min(a1, a2, a3, a4) >= 255) return;
      const result = this.drawWord(word, time, d.start, layer, rotationOrigin);
      if (result) masks.push(result);
    });
    // As in libass, the shadows of an event are painted first, then its borders, then its fills,
    // so the border of a run cannot cover the fill of the run before it.
    for (const phase of ['shadow', 'border', 'fill'] as const) {
      for (const word of masks) {
        const bitmap = word[phase];
        if (!bitmap) continue;
        const { colors, opacity } = word.font;
        const transform = word.transform;
        if (transform && transform.frz) {
          layer.ctx.save();
          layer.ctx.translate(transform.origin.x, transform.origin.y);
          layer.ctx.rotate((transform.frz * Math.PI) / 180);
          layer.ctx.translate(-transform.origin.x, -transform.origin.y);
        }
        if (phase === 'fill') {
          this.paintMask(
            bitmap,
            colors.c1,
            colors.a1,
            opacity,
            layer,
            word.secondary,
            colors.c2,
            colors.a2
          );
        } else if (phase === 'border') {
          this.paintMask(bitmap, colors.c3, colors.a3, opacity, layer);
        } else {
          this.paintMask(bitmap, colors.c4, colors.a4, opacity, layer);
        }
        if (transform && transform.frz) {
          layer.ctx.restore();
        }
      }
    }

    layer.ctx.restore();
  }

  private intersects(r1: Rect, r2: Rect): boolean {
    return !(r2.x > r1.x + r1.w || r2.x + r2.w < r1.x || r2.y > r1.y + r1.h || r2.y + r2.h < r1.y);
  }

  private applyClip(clip: Clip, layer: Layer) {
    const ctx = layer.ctx;
    const Xratio = layer.canvas.width / this.playerResX;
    const Yratio = layer.canvas.height / this.playerResY;

    if (clip.dots) {
      const { x1, y1, x2, y2 } = clip.dots;
      const x = x1 * Xratio;
      const y = y1 * Yratio;
      const w = (x2 - x1) * Xratio;
      const h = (y2 - y1) * Yratio;

      ctx.beginPath();
      if (clip.inverse) {
        ctx.rect(0, 0, layer.canvas.width, layer.canvas.height);
        ctx.rect(x, y, w, h);
        ctx.clip('evenodd');
      } else {
        ctx.rect(x, y, w, h);
        ctx.clip();
      }
    } else if (clip.drawing) {
      const scaleFactor = Math.pow(2, -(clip.scale - 1));
      const path = this.drawingPath(clip.drawing, scaleFactor * Xratio, scaleFactor * Yratio);

      if (clip.inverse) {
        const finalPath = new Path2D();
        finalPath.rect(0, 0, layer.canvas.width, layer.canvas.height);
        finalPath.addPath(path);
        ctx.clip(finalPath, 'evenodd');
      } else {
        ctx.clip(path);
      }
    }
  }

  private getFontHash(font: StyleDescriptor): number {
    return stringHash(JSON.stringify(font));
  }

  /**
   * The resolution libass measures `\blur`, the 3D camera distance and unscaled borders in:
   * LayoutResX/Y, else the video's own size, else PlayRes. With a 1080p video and a 720p script,
   * a blur of 1 is 1/1080 of the frame, not 1/720.
   */
  private layoutRes(): { x: number; y: number } {
    const x = Number(this.compiledASS.info.LayoutResX);
    const y = Number(this.compiledASS.info.LayoutResY);
    if (x > 0 && y > 0) return { x, y };
    const { videoWidth, videoHeight } = this.video;
    if (videoWidth > 0 && videoHeight > 0) return { x: videoWidth, y: videoHeight };
    return { x: this.playerResX, y: this.playerResY };
  }

  private drawWord(
    word: Word,
    time: number,
    startTime: number,
    layer: Layer,
    origin?: Vector2
  ): WordMasks | null {
    const head = word.value[0] as Exclude<Char, { kind: CHARKIND.NEWLINE }>;
    // The fraction of the pen goes into the glyph raster: the mask then sits on whole pixels and
    // never has to be resampled, which would blur every edge. Like libass, the pen is kept to
    // 1/8 pixel, so moving text reuses its rasters.
    const pen = { x: Math.round(head.pos.x * 8) / 8, y: Math.round(head.pos.y * 8) / 8 };
    const penX = Math.floor(pen.x);
    const penY = Math.floor(pen.y);
    const subX = pen.x - penX;
    const subY = pen.y - penY;
    const font = word.font;
    // Rotated or sheared coverage is resampled, so it is rasterized with 2x2 samples per pixel.
    // Otherwise it already lands on whole pixels and is used as it is.
    const has3D = font.t.frx || font.t.fry || font.t.fax || font.t.fay;
    const flat = !has3D && !font.t.frz;
    const gpu2D = !has3D && Boolean(font.t.frz);
    const isFlatMask = flat || gpu2D;
    const supersample = isFlatMask ? 1 : 2;
    const glyph = this.glyphBitmap(word, layer, subX, subY, supersample);
    if (!glyph) return null;
    const layout = this.layoutRes();
    const blurScaleX = layer.canvas.width / layout.x;
    const blurScaleY = layer.canvas.height / layout.y;
    const scaled = this.compiledASS.info.ScaledBorderAndShadow !== 'no';
    const ratioX = scaled ? layer.canvas.width / this.playerResX : blurScaleX;
    const ratioY = scaled ? layer.canvas.height / this.playerResY : blurScaleY;
    const borderX = Math.max(0, font.xbord * ratioX);
    const borderY = Math.max(0, font.ybord * ratioY);
    const shadowX = font.xshad * ratioX;
    const shadowY = font.yshad * ratioY;
    const box = font.borderStyle === 3;
    const hasBorder = borderX > 0 || borderY > 0 || box;
    const pad = Math.ceil(Math.max(borderX, borderY) + 2) * supersample;
    const width = glyph.width + 2 * pad;
    const height = glyph.height + 2 * pad;
    if (width * height > MAX_RASTER_PIXELS) return null;
    const sourceX = penX + glyph.x - pad / supersample;
    const sourceY = penY + glyph.y - pad / supersample;
    const sigmaX = Math.max(0, font.blur) * blurScaleX * 0.8493218;
    const sigmaY = Math.max(0, font.blur) * blurScaleY * 0.8493218;
    const be = Math.min(127, Math.max(0, Math.round(font.be)));
    const padding = Math.ceil(
      Math.max(sigmaX, sigmaY) * 4 +
        Math.min(be, 5) +
        Math.max(Math.abs(shadowX), Math.abs(shadowY)) +
        2
    );
    let cacheKey: string | undefined;
    const isAnimatedTransform = word.value.some(
      (c) =>
        c.kind !== CHARKIND.NEWLINE &&
        c.tag.t?.some((anim: any) => {
          const at = anim.tag;
          return (
            at &&
            (at.frz !== undefined ||
              at.frx !== undefined ||
              at.fry !== undefined ||
              at.fax !== undefined ||
              at.fay !== undefined ||
              at.fscx !== undefined ||
              at.fscy !== undefined)
          );
        })
    );
    if (isFlatMask || !isAnimatedTransform) {
      let id = this.glyphIds.get(glyph);
      if (id === undefined) {
        id = this.nextGlyphId++;
        this.glyphIds.set(glyph, id);
      }
      const cropLeft = Math.max(0, padding - Math.floor(sourceX));
      const cropTop = Math.max(0, padding - Math.floor(sourceY));
      const cropRight = Math.max(
        0,
        Math.ceil(sourceX + width / supersample) + padding - layer.canvas.width
      );
      const cropBottom = Math.max(
        0,
        Math.ceil(sourceY + height / supersample) + padding - layer.canvas.height
      );
      if (isFlatMask) {
        cacheKey = `${id}|${borderX}|${borderY}|${box}|${word.w}|${sigmaX}|${sigmaY}|${be}|${padding}|${layer.canvas.width}|${layer.canvas.height}|${subX}|${subY}|${cropLeft}|${cropTop}|${cropRight}|${cropBottom}`;
      } else {
        const ox = origin ? origin.x : head.pos.x;
        const oy = origin ? origin.y : head.pos.y;
        cacheKey = `r|${id}|${borderX}|${borderY}|${box}|${word.w}|${sigmaX}|${sigmaY}|${be}|${padding}|${layer.canvas.width}|${layer.canvas.height}|${subX}|${subY}|${cropLeft}|${cropTop}|${cropRight}|${cropBottom}|${penX}|${penY}|${head.pos.x}|${head.pos.y}|${ox}|${oy}|${font.t.frz}|${font.t.frx}|${font.t.fry}|${font.t.fax ?? 0}|${font.t.fay ?? 0}|${font.t.fscx}|${font.t.fscy}`;
      }
    }
    const cached = cacheKey === undefined ? undefined : this.filteredMaskCache.get(cacheKey);
    let projected: { fill: Bitmap; border?: Bitmap };
    if (cached) {
      const dx = penX - cached.penX;
      const dy = penY - cached.penY;
      const copy = (bitmap: Bitmap): Bitmap => ({
        ...bitmap,
        data: bitmap.data.slice(),
        x: bitmap.x + dx,
        y: bitmap.y + dy
      });
      projected = { fill: copy(cached.fill), border: cached.border && copy(cached.border) };
    } else {
      const data = new Uint8ClampedArray(width * height);
      placeMask(glyph.data, glyph.width, glyph.height, data, width, height, pad, pad);
      const source = { data, width, height, x: sourceX, y: sourceY };
      let border: Uint8ClampedArray | undefined;
      if (box) {
        border = new Uint8ClampedArray(data.length);
        // The glyph may come from the cache, which leaves the context at another font
        this.applyFont(font, layer);
        const metrics = this.measure(layer.ctx, chunkCharToString(word.value));
        const sy = Math.abs(font.t.fscy / 100);
        const ascent =
          (metrics.fontBoundingBoxAscent ||
            metrics.actualBoundingBoxAscent ||
            font.fontsize * 0.8) * sy;
        const descent =
          (metrics.fontBoundingBoxDescent ||
            metrics.actualBoundingBoxDescent ||
            font.fontsize * 0.2) * sy;
        const s = supersample;
        const top = Math.max(0, Math.floor((subY - ascent - glyph.y - borderY) * s) + pad);
        const bottom = Math.min(height, Math.ceil((subY + descent - glyph.y + borderY) * s) + pad);
        const left = Math.max(0, Math.floor((subX - glyph.x - borderX) * s) + pad);
        const right = Math.min(width, Math.ceil((subX + word.w - glyph.x + borderX) * s) + pad);
        for (let y = top; y < bottom; y++) border.fill(255, y * width + left, y * width + right);
      } else if (hasBorder) {
        // Stroking the outline is libass's way and much faster than dilating the bitmap, which
        // is left for pens the browser cannot draw. The glyph and its stroke make the border.
        const stroked = this.glyphBitmap(word, layer, subX, subY, supersample, {
          x: borderX,
          y: borderY
        });
        if (stroked) {
          border = new Uint8ClampedArray(data.length);
          const left = (stroked.x - glyph.x) * supersample + pad;
          const top = (stroked.y - glyph.y) * supersample + pad;
          placeMask(stroked.data, stroked.width, stroked.height, border, width, height, left, top);
          for (let i = 0; i < border.length; i++) if (data[i]! > border[i]!) border[i] = data[i]!;
        } else {
          border = expandMask(data, width, height, borderX * supersample, borderY * supersample);
        }
      }
      const sx = font.t.fscx / 100;
      const sy = font.t.fscy / 100;
      const matrix = isFlatMask
        ? ([1, 0, 0, 0, 1, 0, 0, 0, 1] as ProjectionMatrix)
        : assProjection(
            origin ?? head.pos,
            {
              ...font.t,
              fax: (font.t.fax ?? 0) * (sx / sy),
              fay: (font.t.fay ?? 0) * (sy / sx),
              shearOrigin: { x: head.pos.x, y: head.pos.y - font.fontsize * sy }
            },
            312.5 * blurScaleY
          );
      const result = this.projectBitmap(source, border, matrix, layer, padding, supersample);
      if (!result) return null;
      projected = result;
      const { fill } = projected;
      if (!hasBorder || box) {
        fill.data = blurMask(fill.data, fill.width, fill.height, sigmaX, sigmaY, be);
      }
      if (projected.border) {
        projected.border.data = blurMask(
          projected.border.data,
          fill.width,
          fill.height,
          sigmaX,
          sigmaY,
          be
        );
      }
      const size = fill.data.length + (projected.border?.data.length ?? 0);
      if (cacheKey !== undefined && size <= MAX_CACHE_BYTES) {
        if (
          this.filteredMaskCacheSize + size > MAX_CACHE_BYTES ||
          this.filteredMaskCache.size >= MAX_CACHE_ENTRIES
        ) {
          this.filteredMaskCache.clear();
          this.filteredMaskCacheSize = 0;
        }
        this.filteredMaskCache.set(cacheKey, {
          fill: { ...fill, data: fill.data.slice() },
          border: projected.border && { ...projected.border, data: projected.border.data.slice() },
          penX,
          penY
        });
        this.filteredMaskCacheSize += size;
      }
    }
    const masks: WordMasks = {
      fill: projected.fill,
      border: projected.border,
      font,
      transform: gpu2D
        ? {
            origin: origin ?? head.pos,
            frz: font.t.frz
          }
        : undefined
    };
    const { fill } = masks;
    const karaoke = word.value.some((char) => char.kind === CHARKIND.NORMAL && char.karaoke);
    const hasShadow = shadowX !== 0 || shadowY !== 0;
    const fillInBorder =
      box || (font.colors.a1 === 0 && font.colors.a2 === 0 && font.opacity === 1);
    const fillInShadow = hasShadow && (karaoke || font.colors.a1 !== 255 || box);
    const fixBorder = (bitmap: Bitmap) => {
      for (let i = 0; i < bitmap.data.length; i++) {
        const b = bitmap.data[i]!;
        const g = fill.data[i]!;
        bitmap.data[i] = b > g ? b - (g >> 1) : 0;
      }
    };
    if (masks.border && !fillInBorder && !fillInShadow) fixBorder(masks.border);
    if (hasShadow && (hasBorder || fillInShadow)) {
      const from = masks.border ?? fill;
      masks.shadow = { ...from, data: from.data.slice(), x: from.x + shadowX, y: from.y + shadowY };
      if (masks.border && fillInBorder && !fillInShadow) fixBorder(masks.shadow);
    }
    if (masks.border && fillInShadow && !fillInBorder) fixBorder(masks.border);
    if (karaoke) {
      let clipWidth = 0;
      const relative = time - startTime;
      for (const char of word.value) {
        if (char.kind !== CHARKIND.NORMAL) continue;
        const k = char.karaoke;
        if (!k || relative >= k.end) clipWidth += char.w;
        else if (relative >= k.start) {
          clipWidth +=
            k.type === 'kf' || k.type === 'K'
              ? char.w * ((relative - k.start) / Math.max(k.end - k.start, 0.000001))
              : char.w;
        }
      }
      masks.secondary = { ...fill, data: fill.data.slice() };
      const split = head.pos.x + clipWidth - fill.x;
      for (let y = 0; y < fill.height; y++) {
        for (let x = 0; x < fill.width; x++) {
          const i = y * fill.width + x;
          const amount = Math.max(0, Math.min(1, split - x));
          fill.data[i] = masks.secondary.data[i]! * amount;
          masks.secondary.data[i] = masks.secondary.data[i]! * (1 - amount);
        }
      }
      if (
        word.value.every(
          (c) =>
            c.kind === CHARKIND.NORMAL && c.karaoke?.type === 'ko' && relative < c.karaoke.start
        )
      ) {
        masks.border = undefined;
      }
    }
    return masks;
  }

  // Glyph coverage at `supersample` (1 or 2) times the output resolution, without ASS alpha or
  // effects. The pen is at (subX, subY) from the bitmap's whole-pixel origin, as libass
  // rasterizes outlines at their subpixel position, so x and y are whole pixels relative to the
  // floored pen. With a border (radii in output pixels) the coverage is instead the outline
  // stroked with an elliptical pen, as libass's stroker does; null when the browser cannot draw
  // that pen.
  private glyphBitmap(
    word: Word,
    layer: Layer,
    subX: number,
    subY: number,
    supersample: number,
    border?: { x: number; y: number }
  ): Bitmap | null {
    const font = word.font;
    const head = word.value[0] as Exclude<Char, { kind: CHARKIND.NEWLINE }>;
    const drawing = head.kind === CHARKIND.DRAWING;
    const scale = drawing
      ? this.drawingScale(head, font, layer)
      : { x: font.t.fscx / 100, y: font.t.fscy / 100 };
    const sx = scale.x;
    const sy = scale.y;
    if (!Number.isFinite(sx + sy) || Math.abs(sx) < 0.00001 || Math.abs(sy) < 0.00001) return null;
    const text = chunkCharToString(word.value);
    const bolden = !drawing && this.resolveFace(font).embolden ? Math.floor(font.fontsize) / 64 : 0;
    // Radius of a round pen stroked along the outline. FreeType's embolden moves the outline out
    // by half its strength. A border is stroked in the text's own scaled space, where the pen is
    // round only when the border has the glyph's proportions; drawings are in output pixels.
    let pen = bolden / 2;
    if (border) {
      if (!(border.x > 0 && border.y > 0)) return null;
      const radius = drawing ? Math.max(border.x, border.y) : border.x / Math.abs(sx);
      if (!drawing && Math.abs(border.y / Math.abs(sy) - radius) > radius * 1e-9) return null;
      pen += radius;
    }
    const growX = bolden * Math.abs(sx) + (border?.x ?? 0);
    const growY = bolden * Math.abs(sy) + (border?.y ?? 0);
    // FreeType's embolden also moves the outline right and up by half its strength
    const originX = subX + (bolden * sx) / 2;
    const originY = subY - (bolden * sy) / 2;
    const key = `${this.fontDecriptorString(font)}|${font.t.fsp}|${sx}|${sy}|${bolden}|${subX}|${subY}|${supersample}|${font.underline}|${font.strikeout}|${font.borderStyle}|${border ? `${border.x},${border.y}` : ''}|${drawing ? head.drawing.d : text}`;
    const cached = this.glyphCache.get(key);
    if (cached) {
      // Kept in order of use, so animated borders push out old strokes and not the glyphs in use
      this.glyphCache.delete(key);
      this.glyphCache.set(key, cached);
      return cached;
    }
    this.applyFont(font, layer);
    const metrics = this.measure(layer.ctx, text);
    const left = drawing ? head.drawing.minX : -(metrics.actualBoundingBoxLeft || 0);
    const right = drawing
      ? head.drawing.minX + head.drawing.width
      : Math.max(metrics.actualBoundingBoxRight || 0, word.w / Math.abs(sx));
    const top = drawing
      ? head.drawing.minY
      : -(font.borderStyle === 3
          ? metrics.fontBoundingBoxAscent || metrics.actualBoundingBoxAscent || font.fontsize * 0.8
          : metrics.actualBoundingBoxAscent || font.fontsize * 0.8);
    const bottom = drawing
      ? head.drawing.minY + head.drawing.height
      : Math.max(
          (font.borderStyle === 3 ? metrics.fontBoundingBoxDescent : 0) ||
            metrics.actualBoundingBoxDescent ||
            font.fontsize * 0.2,
          font.underline
            ? (metrics.actualBoundingBoxDescent || 2) +
                Math.max(font.fontsize / 20, 1 / Math.abs(sy))
            : 0
        );
    const x = Math.floor(Math.min(left * sx, right * sx) + originX - growX - 2);
    const y = Math.floor(Math.min(top * sy, bottom * sy) + originY - growY - 2);
    const width = Math.ceil(
      (Math.max(left * sx, right * sx) + originX + growX + 2 - x) * supersample
    );
    const height = Math.ceil(
      (Math.max(top * sy, bottom * sy) + originY + growY + 2 - y) * supersample
    );
    if (width < 1 || height < 1 || width * height > MAX_RASTER_PIXELS) return null;
    // Skia (Chrome) draws text of up to 256 device pixels from glyph masks with contrast and gamma
    // boosts, heavier and softer than libass's coverage. Text past 256 pixels along either axis is
    // filled as an outline with exact coverage, so the glyph's larger axis is drawn a whole number
    // of times longer and reduced. Text under 8 pixels (as when it grows from \fscx0) is left as
    // it is.
    const outlineFactor = Math.ceil(
      257 / (supersample * font.fontsize * Math.max(Math.abs(sx), Math.abs(sy)))
    );
    const factor =
      drawing || !(outlineFactor > 1 && outlineFactor * supersample <= 32)
        ? 1
        : Math.max(
            1,
            Math.min(outlineFactor, Math.floor(MAX_SCRATCH_CANVAS_PIXELS / (width * height)))
          );
    const tall = Math.abs(sy) >= Math.abs(sx);
    const factorX = tall ? 1 : factor;
    const factorY = tall ? factor : 1;
    const rasterWidth = width * factorX;
    const rasterHeight = height * factorY;
    // One scratch surface, read back on every use: willReadFrequently keeps it on the CPU.
    const ctx = (this.glyphContext ??= createScratchCanvas().getContext('2d', {
      willReadFrequently: true
    }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D);
    const canvas = ctx.canvas;
    // Resizing reallocates the surface, so it only grows (up to 4M pixels); just the raster's
    // corner is cleared and read.
    const large = canvas.width * canvas.height > MAX_SCRATCH_CANVAS_PIXELS;
    if (canvas.width < rasterWidth || canvas.height < rasterHeight || large) {
      canvas.width = Math.max(rasterWidth, large ? 0 : canvas.width);
      canvas.height = Math.max(rasterHeight, large ? 0 : canvas.height);
    } else {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, rasterWidth, rasterHeight);
    }
    ctx.font = this.fontDecriptorString(font);
    ctx.letterSpacing = `${font.t.fsp}px`;
    // Unhinted outlines at their exact position, like libass and like the measuring context
    ctx.textRendering = 'geometricPrecision';
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#fff';
    // A round pen adds every point within its radius of the outline: the glyph dilated by it
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.filter = 'none';
    ctx.shadowColor = 'transparent';
    const kx = supersample * factorX;
    const ky = supersample * factorY;
    ctx.setTransform(kx, 0, 0, ky, (originX - x) * kx, (originY - y) * ky);
    if (drawing) {
      const path = this.drawingPath(head.drawing, sx, sy);
      if (!border) {
        ctx.fill(path);
      } else if (border.x === border.y) {
        ctx.lineWidth = 2 * pen;
        ctx.stroke(path);
      } else {
        // An elliptical pen is a round one in a space stretched by the border radii
        const outline = new Path2D();
        outline.addPath(path, new DOMMatrix([pen / border.x, 0, 0, pen / border.y, 0, 0]));
        ctx.scale(border.x / pen, border.y / pen);
        ctx.lineWidth = 2 * pen;
        ctx.stroke(outline);
      }
    } else {
      ctx.scale(sx, sy);
      ctx.lineWidth = 2 * pen;
      // A border is only the stroke: the caller already has the glyph's own coverage
      if (!border) ctx.fillText(text, 0, 0);
      if (pen) ctx.strokeText(text, 0, 0);
      const thickness = Math.max(font.fontsize / 20, 1 / Math.abs(sy));
      const lines: number[] = [];
      if (font.underline) lines.push(metrics.actualBoundingBoxDescent || 2);
      if (font.strikeout) lines.push(-font.fontsize * 0.3);
      for (const top of lines) {
        if (!border) ctx.fillRect(0, top, word.w / Math.abs(sx), thickness);
        if (pen) ctx.strokeRect(0, top, word.w / Math.abs(sx), thickness);
      }
    }
    const rgba = ctx.getImageData(0, 0, rasterWidth, rasterHeight).data;
    const data = reduceAlpha(rgba, width, height, factorX, factorY);
    const bitmap = { data, width, height, x, y };
    if (data.length <= MAX_CACHE_BYTES) {
      for (const [oldKey, old] of this.glyphCache) {
        if (
          this.glyphCacheSize + data.length <= MAX_CACHE_BYTES &&
          this.glyphCache.size < MAX_CACHE_ENTRIES
        )
          break;
        this.glyphCache.delete(oldKey);
        this.glyphCacheSize -= old.data.length;
      }
      this.glyphCache.set(key, bitmap);
      this.glyphCacheSize += data.length;
    }
    return bitmap;
  }

  // Resamples affine coverage directly without GPU readback stalls (getImageData).
  // Input coverage has `supersample` pixels per output pixel; colors and ASS alpha are applied
  // later.
  private projectAffineBitmap(
    source: Bitmap,
    border: Uint8ClampedArray | undefined,
    matrix: ProjectionMatrix,
    x: number,
    y: number,
    width: number,
    height: number,
    supersample: number
  ): { fill: Bitmap; border?: Bitmap } | null {
    const denominator = matrix[8];
    if (Math.abs(denominator) < 1e-12) return null;
    const m0 = matrix[0] / (supersample * denominator);
    const m1 = matrix[1] / (supersample * denominator);
    const m3 = matrix[3] / (supersample * denominator);
    const m4 = matrix[4] / (supersample * denominator);
    const tx = (matrix[0] * source.x + matrix[1] * source.y + matrix[2]) / denominator - x;
    const ty = (matrix[3] * source.x + matrix[4] * source.y + matrix[5]) / denominator - y;
    const det = m0 * m4 - m1 * m3;
    if (Math.abs(det) < 1e-12) return null;

    const inv0 = m4 / det;
    const inv1 = -m1 / det;
    const inv3 = -m3 / det;
    const inv4 = m0 / det;
    const invTx = (m1 * ty - m4 * tx) / det;
    const invTy = (m3 * tx - m0 * ty) / det;

    const fill: Bitmap = { data: new Uint8ClampedArray(width * height), width, height, x, y };
    const outline = border ? { ...fill, data: new Uint8ClampedArray(width * height) } : undefined;
    const fillData = fill.data;
    const outlineData = outline ? outline.data : null;
    const hasOutline = outlineData !== null && border !== undefined;

    const sw = source.width;
    const sh = source.height;
    const c0x = tx,
      c0y = ty;
    const c1x = m0 * sw + tx,
      c1y = m3 * sw + ty;
    const c2x = m1 * sh + tx,
      c2y = m4 * sh + ty;
    const c3x = m0 * sw + m1 * sh + tx,
      c3y = m3 * sw + m4 * sh + ty;

    const minTargetX = Math.max(0, Math.floor(Math.min(c0x, c1x, c2x, c3x)) - 1);
    const maxTargetX = Math.min(width, Math.ceil(Math.max(c0x, c1x, c2x, c3x)) + 1);
    const minTargetY = Math.max(0, Math.floor(Math.min(c0y, c1y, c2y, c3y)) - 1);
    const maxTargetY = Math.min(height, Math.ceil(Math.max(c0y, c1y, c2y, c3y)) + 1);

    const input = source.data;
    const borderData = border;

    for (let row = minTargetY; row < maxTargetY; row++) {
      let sx = inv0 * (minTargetX + 0.5) + inv1 * (row + 0.5) + invTx;
      let sy = inv3 * (minTargetX + 0.5) + inv4 * (row + 0.5) + invTy;
      const rowOffset = row * width;
      for (let col = minTargetX; col < maxTargetX; col++) {
        if (sx > 0 && sx < sw && sy > 0 && sy < sh) {
          const px = sx - 0.5;
          const py = sy - 0.5;
          const ix = Math.floor(px);
          const iy = Math.floor(py);
          const fx = px - ix;
          const fy = py - iy;

          if (ix >= 0 && ix + 1 < sw && iy >= 0 && iy + 1 < sh) {
            const idx = iy * sw + ix;
            const w00 = (1 - fx) * (1 - fy);
            const w10 = fx * (1 - fy);
            const w01 = (1 - fx) * fy;
            const w11 = fx * fy;
            fillData[rowOffset + col] = Math.round(
              input[idx]! * w00 +
                input[idx + 1]! * w10 +
                input[idx + sw]! * w01 +
                input[idx + sw + 1]! * w11
            );
            if (hasOutline && borderData) {
              outlineData[rowOffset + col] = Math.round(
                borderData[idx]! * w00 +
                  borderData[idx + 1]! * w10 +
                  borderData[idx + sw]! * w01 +
                  borderData[idx + sw + 1]! * w11
              );
            }
          } else {
            const v00 = ix >= 0 && ix < sw && iy >= 0 && iy < sh ? input[iy * sw + ix]! : 0;
            const v10 =
              ix + 1 >= 0 && ix + 1 < sw && iy >= 0 && iy < sh ? input[iy * sw + (ix + 1)]! : 0;
            const v01 =
              ix >= 0 && ix < sw && iy + 1 >= 0 && iy + 1 < sh ? input[(iy + 1) * sw + ix]! : 0;
            const v11 =
              ix + 1 >= 0 && ix + 1 < sw && iy + 1 >= 0 && iy + 1 < sh
                ? input[(iy + 1) * sw + (ix + 1)]!
                : 0;
            fillData[rowOffset + col] = Math.round(
              (v00 * (1 - fx) + v10 * fx) * (1 - fy) + (v01 * (1 - fx) + v11 * fx) * fy
            );
            if (hasOutline && borderData) {
              const b00 = ix >= 0 && ix < sw && iy >= 0 && iy < sh ? borderData[iy * sw + ix]! : 0;
              const b10 =
                ix + 1 >= 0 && ix + 1 < sw && iy >= 0 && iy < sh
                  ? borderData[iy * sw + (ix + 1)]!
                  : 0;
              const b01 =
                ix >= 0 && ix < sw && iy + 1 >= 0 && iy + 1 < sh
                  ? borderData[(iy + 1) * sw + ix]!
                  : 0;
              const b11 =
                ix + 1 >= 0 && ix + 1 < sw && iy + 1 >= 0 && iy + 1 < sh
                  ? borderData[(iy + 1) * sw + (ix + 1)]!
                  : 0;
              outlineData[rowOffset + col] = Math.round(
                (b00 * (1 - fx) + b10 * fx) * (1 - fy) + (b01 * (1 - fx) + b11 * fx) * fy
              );
            }
          }
        }
        sx += inv0;
        sy += inv3;
      }
    }
    return { fill, border: outline };
  }

  // Coverage with `supersample` (1 or 2) pixels per output pixel, mapped to output pixels.
  private projectBitmap(
    source: Bitmap,
    border: Uint8ClampedArray | undefined,
    matrix: ProjectionMatrix,
    layer: Layer,
    padding: number,
    supersample: number
  ): { fill: Bitmap; border?: Bitmap } | null {
    const inverse = invertProjection(matrix);
    if (!inverse) return null;
    const right = source.x + source.width / supersample;
    const bottom = source.y + source.height / supersample;
    const points = [
      projectPoint(matrix, source.x, source.y),
      projectPoint(matrix, right, source.y),
      projectPoint(matrix, source.x, bottom),
      projectPoint(matrix, right, bottom)
    ];
    const visible = points.filter((p) => p !== null);
    if (!visible.length) return null;
    const crossesPlane = visible.length !== points.length;
    const minX = crossesPlane ? -padding : Math.min(...visible.map((p) => p.x));
    const minY = crossesPlane ? -padding : Math.min(...visible.map((p) => p.y));
    const maxX = crossesPlane ? layer.canvas.width + padding : Math.max(...visible.map((p) => p.x));
    const maxY = crossesPlane
      ? layer.canvas.height + padding
      : Math.max(...visible.map((p) => p.y));
    const x = Math.max(-padding, Math.floor(minX) - padding);
    const y = Math.max(-padding, Math.floor(minY) - padding);
    const width = Math.min(layer.canvas.width + padding, Math.ceil(maxX) + padding) - x;
    const height = Math.min(layer.canvas.height + padding, Math.ceil(maxY) + padding) - y;
    if (width < 1 || height < 1 || width * height > MAX_RASTER_PIXELS) return null;
    const flat = Math.abs(matrix[6]) < 1e-10 && Math.abs(matrix[7]) < 1e-10;
    // Without rotation or shear the samples line up with the output pixels (see glyphBitmap):
    // they are used as they are, or 2x2 samples are box filtered to their exact coverage. Any
    // resampling would blur the edges.
    const shiftX = matrix[2] / matrix[8] + source.x;
    const shiftY = matrix[5] / matrix[8] + source.y;
    if (
      flat &&
      Math.abs(matrix[0] / matrix[8] - 1) < 1e-10 &&
      Math.abs(matrix[4] / matrix[8] - 1) < 1e-10 &&
      Math.abs(matrix[1]) < 1e-10 &&
      Math.abs(matrix[3]) < 1e-10 &&
      Math.abs(shiftX - Math.round(shiftX)) < 1e-6 &&
      Math.abs(shiftY - Math.round(shiftY)) < 1e-6
    ) {
      const left = (x - Math.round(shiftX)) * supersample;
      const top = (y - Math.round(shiftY)) * supersample;
      const place = (data: Uint8ClampedArray): Bitmap => {
        let coverage: Uint8ClampedArray;
        if (supersample === 2) {
          coverage = halveMask(data, source.width, source.height, left, top, width, height);
        } else {
          coverage = new Uint8ClampedArray(width * height);
          placeMask(data, source.width, source.height, coverage, width, height, -left, -top);
        }
        return { data: coverage, width, height, x, y };
      };
      return { fill: place(source.data), border: border ? place(border) : undefined };
    }
    if (flat) {
      const affine = this.projectAffineBitmap(
        source,
        border,
        matrix,
        x,
        y,
        width,
        height,
        supersample
      );
      if (affine) return affine;
    }
    const fill: Bitmap = { data: new Uint8ClampedArray(width * height), width, height, x, y };
    const outline = border ? { ...fill, data: new Uint8ClampedArray(width * height) } : undefined;
    const fillData = fill.data;
    const outlineData = outline ? outline.data : null;
    const hasOutline = outlineData !== null && border !== undefined;
    const sourceWidth = source.width;
    const sourceHeight = source.height;
    const input = source.data;
    const inv0 = inverse[0];
    const inv1 = inverse[1];
    const inv2 = inverse[2];
    const inv3 = inverse[3];
    const inv4 = inverse[4];
    const inv5 = inverse[5];
    const inv6 = inverse[6];
    const inv7 = inverse[7];
    const inv8 = inverse[8];
    const fromX = 0;
    const fromY = 0;
    const toX = width;
    const toY = height;

    for (let row = fromY; row < toY; row++) {
      const screenY = y + row + 0.5;
      const rowBaseX = inv1 * screenY + inv2;
      const rowBaseY = inv4 * screenY + inv5;
      const rowBaseW = inv7 * screenY + inv8;
      let baseX = rowBaseX + inv0 * (x + fromX + 0.5);
      let baseY = rowBaseY + inv3 * (x + fromX + 0.5);
      let baseW = rowBaseW + inv6 * (x + fromX + 0.5);
      const rowOffset = row * width;

      for (let col = fromX; col < toX; col++) {
        if (baseW > 1e-8) {
          const invW = 1 / baseW;
          const px = (baseX * invW - source.x) * supersample - 0.5;
          const py = (baseY * invW - source.y) * supersample - 0.5;
          const ix = Math.floor(px);
          const iy = Math.floor(py);

          if (ix >= 0 && iy >= 0 && ix + 1 < sourceWidth && iy + 1 < sourceHeight) {
            const fx = px - ix;
            const fy = py - iy;
            const idx = iy * sourceWidth + ix;
            const w00 = (1 - fx) * (1 - fy);
            const w10 = fx * (1 - fy);
            const w01 = (1 - fx) * fy;
            const w11 = fx * fy;
            fillData[rowOffset + col] = Math.round(
              input[idx]! * w00 +
                input[idx + 1]! * w10 +
                input[idx + sourceWidth]! * w01 +
                input[idx + sourceWidth + 1]! * w11
            );
            if (hasOutline && border) {
              outlineData[rowOffset + col] = Math.round(
                border[idx]! * w00 +
                  border[idx + 1]! * w10 +
                  border[idx + sourceWidth]! * w01 +
                  border[idx + sourceWidth + 1]! * w11
              );
            }
          } else if (ix >= -1 && iy >= -1 && ix <= sourceWidth && iy <= sourceHeight) {
            const fx = px - ix;
            const fy = py - iy;
            const v00 =
              ix >= 0 && ix < sourceWidth && iy >= 0 && iy < sourceHeight
                ? input[iy * sourceWidth + ix]!
                : 0;
            const v10 =
              ix + 1 >= 0 && ix + 1 < sourceWidth && iy >= 0 && iy < sourceHeight
                ? input[iy * sourceWidth + (ix + 1)]!
                : 0;
            const v01 =
              ix >= 0 && ix < sourceWidth && iy + 1 >= 0 && iy + 1 < sourceHeight
                ? input[(iy + 1) * sourceWidth + ix]!
                : 0;
            const v11 =
              ix + 1 >= 0 && ix + 1 < sourceWidth && iy + 1 >= 0 && iy + 1 < sourceHeight
                ? input[(iy + 1) * sourceWidth + (ix + 1)]!
                : 0;
            fillData[rowOffset + col] = Math.round(
              (v00 * (1 - fx) + v10 * fx) * (1 - fy) + (v01 * (1 - fx) + v11 * fx) * fy
            );
            if (hasOutline && border) {
              const b00 =
                ix >= 0 && ix < sourceWidth && iy >= 0 && iy < sourceHeight
                  ? border[iy * sourceWidth + ix]!
                  : 0;
              const b10 =
                ix + 1 >= 0 && ix + 1 < sourceWidth && iy >= 0 && iy < sourceHeight
                  ? border[iy * sourceWidth + (ix + 1)]!
                  : 0;
              const b01 =
                ix >= 0 && ix < sourceWidth && iy + 1 >= 0 && iy + 1 < sourceHeight
                  ? border[(iy + 1) * sourceWidth + ix]!
                  : 0;
              const b11 =
                ix + 1 >= 0 && ix + 1 < sourceWidth && iy + 1 >= 0 && iy + 1 < sourceHeight
                  ? border[(iy + 1) * sourceWidth + (ix + 1)]!
                  : 0;
              outlineData[rowOffset + col] = Math.round(
                (b00 * (1 - fx) + b10 * fx) * (1 - fy) + (b01 * (1 - fx) + b11 * fx) * fy
              );
            }
          }
        }
        baseX += inv0;
        baseY += inv3;
        baseW += inv6;
      }
    }
    return { fill, border: outline };
  }

  private paintMask(
    bitmap: Bitmap,
    color: string,
    alpha: number,
    opacity: number,
    layer: Layer,
    secondary?: Bitmap,
    secondaryColor = color,
    secondaryAlpha = alpha
  ) {
    if ((alpha >= 255 && (!secondary || secondaryAlpha >= 255)) || opacity <= 0) return;

    if (!secondary) {
      const cached = this.paintedMaskCache.get(bitmap.data);
      if (cached && cached.color === color && cached.alpha === alpha) {
        layer.ctx.globalAlpha = opacity;
        layer.ctx.drawImage(
          cached.canvas,
          0,
          0,
          bitmap.width,
          bitmap.height,
          bitmap.x,
          bitmap.y,
          bitmap.width,
          bitmap.height
        );
        return;
      }
    }

    const canvas = this.paintCanvas;
    const large = canvas.width * canvas.height > MAX_SCRATCH_CANVAS_PIXELS;
    if (canvas.width < bitmap.width || canvas.height < bitmap.height || large) {
      canvas.width = Math.max(bitmap.width, large ? 0 : canvas.width);
      canvas.height = Math.max(bitmap.height, large ? 0 : canvas.height);
    }
    const ctx = canvas.getContext('2d') as LayerContext;
    let pixels = this.paintImageData;
    if (!pixels || pixels.width !== bitmap.width || pixels.height !== bitmap.height) {
      pixels = this.paintImageData = ctx.createImageData(bitmap.width, bitmap.height);
    }
    const r1 = parseInt(color.slice(1, 3), 16) || 0;
    const g1 = parseInt(color.slice(3, 5), 16) || 0;
    const b1 = parseInt(color.slice(5, 7), 16) || 0;
    if (!secondary) {
      const texel = this.texelBuffer;
      const words = this.texelWords;
      const factor = (255 - alpha) / 255;
      for (let value = 0; value < 256; value++) {
        texel[value * 4] = r1;
        texel[value * 4 + 1] = g1;
        texel[value * 4 + 2] = b1;
        texel[value * 4 + 3] = (value * factor) | 0;
      }
      const target = new Uint32Array(pixels.data.buffer);
      const data = bitmap.data;
      for (let i = 0; i < data.length; i++) target[i] = words[data[i]!]!;
    } else {
      const r2 = parseInt(secondaryColor.slice(1, 3), 16) || 0;
      const g2 = parseInt(secondaryColor.slice(3, 5), 16) || 0;
      const b2 = parseInt(secondaryColor.slice(5, 7), 16) || 0;
      for (let i = 0; i < bitmap.data.length; i++) {
        const a = (bitmap.data[i]! * (255 - alpha)) / 255;
        const b = (secondary.data[i]! * (255 - secondaryAlpha)) / 255;
        const total = a + b;
        if (!total) {
          pixels.data[i * 4 + 3] = 0;
          continue;
        }
        pixels.data[i * 4] = ((r1 * a + r2 * b) / total) | 0;
        pixels.data[i * 4 + 1] = ((g1 * a + g2 * b) / total) | 0;
        pixels.data[i * 4 + 2] = ((b1 * a + b2 * b) / total) | 0;
        pixels.data[i * 4 + 3] = total | 0;
      }
    }
    ctx.putImageData(pixels, 0, 0);

    if (!secondary && bitmap.width > 0 && bitmap.height > 0) {
      const scratch = createScratchCanvas(bitmap.width, bitmap.height);
      const sCtx = scratch.getContext('2d') as LayerContext;
      sCtx.drawImage(canvas, 0, 0, bitmap.width, bitmap.height, 0, 0, bitmap.width, bitmap.height);
      this.paintedMaskCache.set(bitmap.data, { canvas: scratch, color, alpha });

      layer.ctx.globalAlpha = opacity;
      layer.ctx.drawImage(
        scratch,
        0,
        0,
        bitmap.width,
        bitmap.height,
        bitmap.x,
        bitmap.y,
        bitmap.width,
        bitmap.height
      );
      return;
    }

    layer.ctx.globalAlpha = opacity;
    layer.ctx.drawImage(
      canvas,
      0,
      0,
      bitmap.width,
      bitmap.height,
      bitmap.x,
      bitmap.y,
      bitmap.width,
      bitmap.height
    );
  }

  clear() {
    this.layers.forEach((layer) => {
      layer.ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
    });
  }

  /**
   * Forces the canvas to be painted again on the next frame.
   * Needed after the canvas is resized, since resizing clears its content.
   */
  invalidate() {
    this.lastStateHash = null;
    this.measureCache.clear();
  }

  private upscaleMargin(margin: Margin) {
    return {
      left: this.upscale(
        margin.left,
        this.playerResX,
        this.layers[0]?.canvas.width || this.playerResX
      ),
      right: this.upscale(
        margin.right,
        this.playerResX,
        this.layers[0]?.canvas.width || this.playerResX
      ),
      vertical: this.upscale(
        margin.vertical,
        this.playerResY,
        this.layers[0]?.canvas.height || this.playerResY
      )
    };
  }

  private applyOverrideTag(tag: CompiledTag, font: StyleDescriptor) {
    // As in libass and VSFilter, \b takes 0, 1 or a weight from 100; anything else keeps the style's
    const b = tag.b as number | undefined;
    if (b !== undefined && (b === 0 || b === 1 || b >= 100)) font.weight = assWeight(b);
    if (tag.i !== undefined) font.italic = tag.i === 1;
    if (tag.u !== undefined) font.underline = tag.u === 1;
    if (tag.s !== undefined) font.strikeout = tag.s === 1;
    if (tag.fn !== undefined) font.fontname = tag.fn;
    if (tag.q !== undefined) font.t.q = tag.q;
    if (tag.fs !== undefined) font.scriptSize = tag.fs;
    // The size in pixels depends on the metrics of the face drawn, which \fn, \b and \i can change
    if (
      tag.fn !== undefined ||
      tag.fs !== undefined ||
      tag.b !== undefined ||
      tag.i !== undefined
    ) {
      font.fontsize = this.upscaleFontSize(font.scriptSize, font);
    }
    if (tag.fscx != null && !Number.isNaN(tag.fscx)) font.t.fscx = tag.fscx;
    if (tag.fscy != null && !Number.isNaN(tag.fscy)) font.t.fscy = tag.fscy;
    if (tag.frz !== undefined) font.t.frz = tag.frz;
    if (tag.frx !== undefined) font.t.frx = tag.frx;
    if (tag.fry !== undefined) font.t.fry = tag.fry;
    if (tag.fax !== undefined) font.t.fax = tag.fax;
    if (tag.fay !== undefined) font.t.fay = tag.fay;
    if (tag.fsp !== undefined) {
      font.t.fsp = this.upscale(
        tag.fsp,
        this.playerResX,
        this.layers[0]?.canvas.width || this.playerResX
      );
    }

    if (tag.t !== undefined) font.customAnimations = tag.t;

    if (tag.c1 !== undefined) font.colors.c1 = swapBBGGRR(tag.c1);
    if (tag.c2 !== undefined) font.colors.c2 = swapBBGGRR(tag.c2);
    if (tag.c3 !== undefined) font.colors.c3 = swapBBGGRR(tag.c3);
    if (tag.c4 !== undefined) font.colors.c4 = swapBBGGRR(tag.c4);
    if (tag.a1 !== undefined) font.colors.a1 = parseAlpha(tag.a1);
    if (tag.a2 !== undefined) font.colors.a2 = parseAlpha(tag.a2);
    if (tag.a3 !== undefined) font.colors.a3 = parseAlpha(tag.a3);
    if (tag.a4 !== undefined) font.colors.a4 = parseAlpha(tag.a4);
    if (tag.xshad !== undefined) font.xshad = tag.xshad;
    if (tag.yshad !== undefined) font.yshad = tag.yshad;
    if (tag.xbord !== undefined) font.xbord = tag.xbord;
    if (tag.ybord !== undefined) font.ybord = tag.ybord;
    if (tag.blur !== undefined) font.blur = tag.blur;
    if (tag.be !== undefined) font.be = tag.be;
  }

  private upscale(x: number, firstcomp: number, secondcomp: number) {
    return (ruleOfThree(firstcomp, secondcomp) * x) / 100;
  }

  // Loaded faces registered under a fontname, or under the name without its weight suffix
  // ("Source Sans Pro Semibold" → "Source Sans Pro"). The second lookup is not libass behavior: it
  // keeps fonts loaded by family name working when the file's own names can't be read (WOFF2).
  private findFaces(fontname: string): FontFaceInfo[] | undefined {
    const name = cleanFontName(fontname).toLowerCase();
    return this.fonts.get(name) ?? this.fonts.get(stripWeightSuffix(name));
  }

  /**
   * Face drawn for a style, chosen like libass: same name, then the closest slant and weight.
   * The browser is asked for the exact weight of that face, so it never fakes a bold (its fake
   * bold is far heavier than libass's). When the face is lighter than asked by more than 150,
   * libass emboldens it (ass_font.c), and so does drawWord. A face whose weight could not be read,
   * or that is flagged bold, is never emboldened: its real weight is unknown.
   * Fonts that were not loaded are left to the browser, with the weight asked.
   *
   * libass scales a font so that its cell, usWinAscent + usWinDescent, is the ASS font size,
   * while the canvas font size is the em square. `ratio` is that of the face drawn, since a bold
   * face can have other metrics than the regular one. Fonts that were not loaded get the ratio of
   * Arial, about 0.895.
   */
  private resolveFace(font: Pick<StyleDescriptor, 'fontname' | 'weight' | 'italic'>): ResolvedFace {
    const key = `${font.fontname}|${font.weight}|${font.italic}`;
    const cached = this.faceCache.get(key);
    if (cached) return cached;

    const faces = this.findFaces(font.fontname);
    let resolved: ResolvedFace = {
      family: null,
      weight: font.weight,
      embolden: false,
      ratio: 0.895
    };
    if (faces && faces.length > 0) {
      const distance = (f: FontFaceInfo) =>
        (f.italic !== font.italic ? 1000 : 0) +
        Math.max(f.minWeight - font.weight, font.weight - f.maxWeight, 0);
      const face = faces.reduce((best, f) => (distance(f) < distance(best) ? f : best));
      resolved = {
        family: face.family,
        weight: Math.min(Math.max(font.weight, face.minWeight), face.maxWeight),
        embolden: face.weightKnown && !face.bold && font.weight > face.maxWeight + 150,
        ratio: face.ratio
      };
    }
    this.faceCache.set(key, resolved);
    return resolved;
  }

  // Size in output pixels of the em square, for a size in script pixels of the face's cell
  private upscaleFontSize(
    fs: number,
    face: Pick<StyleDescriptor, 'fontname' | 'weight' | 'italic'>
  ) {
    const size = this.upscale(
      fs,
      this.playerResY,
      this.layers[0]?.canvas.height || this.playerResY
    );
    return size * this.resolveFace(face).ratio;
  }

  // A font that is missing falls back to Arial, then to the sans-serif font, instead of the
  // browser default (often a serif font)
  private fontDecriptorString(font: StyleDescriptor) {
    const face = this.resolveFace(font);
    const quote = (name: string) => `"${name.replace(/["\\]/g, '\\$&')}"`;
    let families: string;
    if (face.family !== null) {
      families = `${quote(face.family)}, Arial, sans-serif`;
    } else {
      const name = cleanFontName(font.fontname);
      const family = stripWeightSuffix(name);
      families =
        family.toLowerCase() !== name.toLowerCase()
          ? `${quote(name)}, ${quote(family)}, Arial, sans-serif`
          : `${quote(name)}, Arial, sans-serif`;
    }
    return `${font.italic ? 'italic ' : ''}${face.weight} ${font.fontsize.toFixed(3)}px ${families}`;
  }

  private computeStyle(name: string, alignment: number, layer: Layer): StyleDescriptor {
    const style = this.styles[name] as CompiledASSStyle;
    if (style === undefined) {
      // TODO: fallbackFont when there is no style
      // Fallbacks most of the time to Arial
      this.log('WARN', `[ass-html5:renderer] no corresponding style "${name}" found`);
    }
    const {
      fn, // font name
      fs, // font size
      a1, // primary alpha
      a2, // secondary alpha
      a3, // outline alpha
      c4, // shadow color
      a4, // shadow alpha
      b, // bold
      i, // italic
      u, // underline
      s, // strikeout
      fscx, // font scale x
      fscy, // font scale y
      fsp, // font spacing
      frz, // font rotation z
      xbord, // x border
      ybord, // y border
      xshad, // x shadow
      yshad, // y shadow
      fe, // font encoding
      q // wrap style
    } = style.tag;

    const { PrimaryColour, OutlineColour, SecondaryColour, BorderStyle } = style.style;

    const weight = assWeight(b);
    const font: StyleDescriptor = {
      fontsize: this.upscaleFontSize(fs, { fontname: fn, weight, italic: i === 1 }),
      scriptSize: fs,
      fontname: fn,
      weight,
      italic: i === 1,
      underline: u === 1,
      strikeout: s === 1,
      colors: {
        c1: convertAegisubColorToHex(PrimaryColour),
        c2: convertAegisubColorToHex(SecondaryColour),
        c3: convertAegisubColorToHex(OutlineColour),
        c4: swapBBGGRR(c4),
        a1: parseAlpha(a1),
        a2: parseAlpha(a2),
        a3: parseAlpha(a3),
        a4: parseAlpha(a4)
      },
      t: {
        fscx: fscx,
        fscy: fscy,
        frz: frz,
        frx: 0,
        fry: 0,
        fsp: this.upscale(fsp, this.playerResX, layer.canvas.width),
        q: q
      },
      customAnimations: [],
      xbord: xbord,
      ybord: ybord,
      xshad: xshad,
      yshad: yshad,
      blur: 0,
      be: 0,
      fe: fe,
      borderStyle: BorderStyle,
      opacity: 1,
      textAlign: this.getAlignment(alignment),
      textBaseline: this.getBaseLine(alignment)
    };

    return font;
  }

  private applyFont(font: StyleDescriptor, layer: Layer) {
    // Only for measuring: words are painted from their masks (see drawWord and paintMask)
    layer.ctx.font = this.fontDecriptorString(font);
    layer.ctx.letterSpacing = `${font.t.fsp}px`;
  }

  private getAlignment(alignment: number) {
    // 1 = (bottom) left
    // 2 = (bottom) center
    // 3 = (bottom) right
    // 4 = (middle) left
    // 5 = (middle) center
    // 6 = (middle) right
    // 7 = (top) left
    // 8 = (top) center
    // 9 = (top) right
    switch (alignment) {
      case 1:
      case 4:
      case 7:
        return Align.Left;
      case 2:
      case 5:
      case 8:
        return Align.Center;
      case 3:
      case 6:
      case 9:
        return Align.Right;
      default:
        return Align.Start;
    }
  }

  private interpolateClip(c1: Clip, c2: Clip, t: number): Clip {
    if (c1.dots && c2.dots) {
      return {
        ...c1,
        dots: {
          x1: lerp(c1.dots.x1, c2.dots.x1, t),
          y1: lerp(c1.dots.y1, c2.dots.y1, t),
          x2: lerp(c1.dots.x2, c2.dots.x2, t),
          y2: lerp(c1.dots.y2, c2.dots.y2, t)
        }
      };
    }
    return c2;
  }

  private getBaseLine(alignment: number) {
    // 1 = (bottom) left
    // 2 = (bottom) center
    // 3 = (bottom) right
    // 4 = (middle) left
    // 5 = (middle) center
    // 6 = (middle) right
    // 7 = (top) left
    // 8 = (top) center
    // 9 = (top) right
    switch (alignment) {
      case 1:
      case 2:
      case 3:
        return Baseline.Bottom;
      case 4:
      case 5:
      case 6:
        return Baseline.Middle;
      case 7:
      case 8:
      case 9:
        return Baseline.Top;
      default:
        return Baseline.Alphabetic;
    }
  }
}
