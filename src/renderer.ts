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
  FontFaceInfo
} from './types';
import { CHARKIND, LOGTYPE, Align, Baseline, FadeKind } from './types';
import {
  ruleOfThree,
  blendAlpha,
  convertAegisubColorToHex,
  swapBBGGRR,
  newCanvas,
  newRender,
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
  buildDrawingPath
} from './utils';

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

export class Renderer {
  private compiledASS: CompiledASS;
  renderDiv: HTMLDivElement;
  layers: Layer[];
  private video: HTMLVideoElement;
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
  private drawingPaths = new WeakMap<Drawing, { x: number; y: number; path: Path2D }>();

  constructor(
    ass: CompiledASS,
    sizes: OnInitSizes,
    video: HTMLVideoElement,
    log: LOGTYPE,
    zIndex?: number,
    fonts: Map<string, FontFaceInfo[]> = new Map()
  ) {
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
    this.renderDiv = newRender(sizes.y, sizes.x, sizes.width, sizes.height, zIndex, video);
    // Every ASS layer is drawn on this one canvas, lower layers first (see display)
    const canvas = newCanvas(sizes.width, sizes.height, 0, 'subtitles', this.renderDiv);
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    if (ctx === null) {
      throw new Error('Unable to initilize the Canvas 2D context');
    }
    //@ts-ignore
    ctx.textRendering = 'geometricPrecision';

    this.layers = [
      {
        canvas,
        ctx
      }
    ];
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
    window.requestAnimationFrame((_timestamp) => {
      // this.previous = timestamp;
      this.animationHandle = requestAnimationFrame(this.render.bind(this));
    });
  }

  private render(_timestamp: number) {
    if (this.stop === true) {
      if (this.animationHandle) {
        this.renderDiv.remove();
        cancelAnimationFrame(this.animationHandle);
      }
    } else {
      // this.dt = (timestamp - this.previous) / 1000.0;
      // this.previous = timestamp;
      this.display(this.video.currentTime);
      this.animationHandle = requestAnimationFrame(this.render.bind(this));
    }
  }

  destroy() {
    this.stop = true;
    // Remove the overlay now, not on the next frame: a hidden tab gets no frames
    if (this.animationHandle) {
      cancelAnimationFrame(this.animationHandle);
    }
    this.renderDiv.remove();
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
  private getSlices(time: number): PreProceesedAss[] {
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
  private measure(ctx: CanvasRenderingContext2D, text: string): TextMetrics {
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
  // not: they are applied around the rotation origin when painting, see applyTransform.
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

        // Word Grouping (per line)
        if (char.kind == CHARKIND.NORMAL || char.kind == CHARKIND.DRAWING) {
          let fHash = resolved.get(char)!.hash;
          if (currentHash !== fHash) {
            if (currentWord.length > 0) {
              if (currentFont !== null) {
                words.push({
                  font: currentFont,
                  value: currentWord,
                  w: chunkCharWidth(currentWord)
                });
                currentWord = [char];
                currentFont = font;
                currentHash = fHash;
              }
            } else {
              currentFont = font;
              currentWord.push(char);
              currentHash = fHash;
            }
          } else {
            currentFont = font;
            currentWord.push(char);
            currentHash = fHash;
          }
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

    words.forEach((word) => {
      word.font.opacity = currentOpacity;
      layer.ctx.save();
      this.drawWord(word, time, d.start, layer, rotationOrigin);
      layer.ctx.restore();
    });

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

  private drawWord(word: Word, time: number, startTime: number, layer: Layer, origin?: Vector2) {
    let str = chunkCharToString(word.value);
    this.applyFont(word.font, layer);
    const wordHead = word.value[0] as Char;

    if (wordHead.kind === CHARKIND.DRAWING) {
      this.drawDrawing(wordHead, layer, word.font, origin);
      return;
    }

    if (wordHead.kind === CHARKIND.NORMAL) {
      const scale = this.textScale(word.font);
      if (scale.x === 0 || scale.y === 0) return;

      this.applyTransform(layer.ctx, word.font, wordHead.pos, origin);
      // The layout already gave the word its scaled size, so it is scaled around its own pen
      layer.ctx.translate(wordHead.pos.x, wordHead.pos.y);
      layer.ctx.scale(scale.x, scale.y);
      layer.ctx.translate(-wordHead.pos.x, -wordHead.pos.y);
      let hasKaraoke = false;
      let clipWidth = 0;

      if (word.value.some((c) => c.kind === CHARKIND.NORMAL && c.karaoke)) {
        hasKaraoke = true;
        word.value.forEach((char) => {
          if (char.kind === CHARKIND.NORMAL && char.karaoke) {
            const relTime = time - startTime;
            const kStart = char.karaoke.start;
            const kEnd = char.karaoke.end;

            if (relTime >= kEnd) {
              clipWidth += char.w;
            } else if (relTime > kStart) {
              const dur = kEnd - kStart;
              if (dur > 0) {
                const p = (relTime - kStart) / dur;
                if (char.karaoke.type === 'kf' || char.karaoke.type === 'K') {
                  clipWidth += char.w * p;
                } else {
                  clipWidth += char.w;
                }
              }
            }
          } else if (char.kind === CHARKIND.NORMAL) {
            clipWidth += char.w;
          }
        });
      }

      let metrics = this.measure(layer.ctx, str);

      // The opaque box shares the canvas with the text now, so it goes first
      if (word.font.borderStyle === 3) {
        this.drawTextBackground(
          wordHead.pos,
          metrics.actualBoundingBoxAscent + metrics.fontBoundingBoxDescent,
          metrics.width,
          word.font
        );
      }

      // libass emboldens a face that is too light by em/64 (ass_glyph_embolden). The border grows
      // from the emboldened outline.
      const bolden = this.resolveFace(word.font).embolden ? word.font.fontsize / 64 : 0;

      if (word.font.borderStyle !== 3) {
        if (word.font.xbord !== 0 || word.font.ybord !== 0) {
          // \bord does not grow with \fscx and \fscy. Canvas has a single pen width, so with
          // different x and y scales the border follows their average.
          const avgScale = (Math.abs(scale.x) + Math.abs(scale.y)) / 2;
          layer.ctx.lineWidth = layer.ctx.lineWidth / avgScale + bolden;
          layer.ctx.strokeText(str, wordHead.pos.x, wordHead.pos.y);
          // With a border, libass blurs the border and keeps the fill sharp
          layer.ctx.filter = 'none';
        }
      }

      if (hasKaraoke) {
        layer.ctx.save();
        layer.ctx.fillStyle = blendAlpha(word.font.colors.c2, word.font.colors.a2);
        this.fillGlyphs(layer.ctx, str, wordHead.pos, bolden);
        layer.ctx.restore();

        layer.ctx.save();
        layer.ctx.beginPath();
        layer.ctx.rect(
          wordHead.pos.x,
          wordHead.pos.y - layer.canvas.height,
          clipWidth / scale.x, // char widths are in layout pixels
          layer.canvas.height * 2
        );
        layer.ctx.clip();

        this.fillGlyphs(layer.ctx, str, wordHead.pos, bolden);
        layer.ctx.restore();
      } else {
        this.fillGlyphs(layer.ctx, str, wordHead.pos, bolden);
      }

      if (word.font.underline) {
        const y = wordHead.pos.y + metrics.emHeightDescent;
        layer.ctx.fillRect(wordHead.pos.x, y, metrics.width, (layer.canvas.height * 0.2) / 100);
      }
      if (word.font.strikeout) {
        const y = wordHead.pos.y - metrics.hangingBaseline / 2;
        layer.ctx.shadowOffsetX = 0;
        layer.ctx.shadowOffsetY = 0;
        layer.ctx.fillRect(wordHead.pos.x, y, metrics.width, (layer.canvas.height * 0.2) / 100);
      }
    }
  }

  // fillText, emboldened by a stroke of `bolden` px in the fill color when the face needs it.
  // The stroke casts no shadow: fillText casts it once.
  private fillGlyphs(ctx: CanvasRenderingContext2D, str: string, pos: Vector2, bolden: number) {
    if (bolden > 0) {
      ctx.save();
      ctx.lineWidth = bolden;
      ctx.strokeStyle = ctx.fillStyle;
      ctx.shadowColor = 'transparent';
      ctx.strokeText(str, pos.x, pos.y);
      ctx.restore();
    }
    ctx.fillText(str, pos.x, pos.y);
  }

  private drawDrawing(char: DrawingChar, layer: Layer, font: StyleDescriptor, origin?: Vector2) {
    const { pos } = char;
    const ctx = layer.ctx;

    ctx.save();

    // \fscx and \fscy are already in the outline, so they do not scale the border
    this.applyTransform(ctx, font, pos, origin);

    const { x: sx, y: sy } = this.drawingScale(char, font, layer);
    const path = this.drawingPath(char.drawing, sx, sy);
    ctx.translate(pos.x, pos.y);

    // Border under the fill, as for text, and only the border blurred
    if ((font.xbord ?? 0) > 0 || (font.ybord ?? 0) > 0) {
      ctx.stroke(path);
      ctx.filter = 'none';
    }
    ctx.fill(path);

    ctx.restore();
  }

  // Rotation, shear and the tilts, around the rotation origin. \fscx and \fscy are not applied
  // here since they are part of the layout, see textScale.
  private applyTransform(
    ctx: CanvasRenderingContext2D,
    font: StyleDescriptor,
    pos: Vector2,
    origin?: Vector2
  ) {
    const t = font.t;
    const org = origin || pos;

    ctx.translate(org.x, org.y);

    if (t.frz) ctx.rotate((-t.frz * Math.PI) / 180);

    const scaleX = t.fry ? Math.cos((t.fry * Math.PI) / 180) : 1;
    const scaleY = t.frx ? Math.cos((t.frx * Math.PI) / 180) : 1;

    if (t.fax || t.fay) {
      ctx.transform(1, t.fay || 0, -(t.fax || 0), 1, 0, 0);
    }

    ctx.scale(scaleX, scaleY);

    ctx.translate(-org.x, -org.y);
  }

  private drawTextBackground(pos: Vector2, height: number, width: number, font: StyleDescriptor) {
    const layer = this.layers[0] as Layer;
    layer.ctx.save();
    layer.ctx.beginPath();
    layer.ctx.fillStyle = font.colors.c2;
    layer.ctx.fillRect(pos.x, pos.y - height, width, height);
    layer.ctx.closePath();
    layer.ctx.restore();
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
    if (tag.fscx !== undefined) font.t.fscx = tag.fscx;
    if (tag.fscy !== undefined) font.t.fscy = tag.fscy;
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
    layer.ctx.font = this.fontDecriptorString(font);
    layer.ctx.fillStyle = blendAlpha(font.colors.c1, font.colors.a1);
    layer.ctx.strokeStyle = blendAlpha(font.colors.c3, font.colors.a3);
    layer.ctx.letterSpacing = `${font.t.fsp}px`;
    layer.ctx.shadowOffsetX = this.upscale(
      font.xshad,
      this.playerResX,
      this.layers[0]?.canvas.width || this.playerResX
    );
    layer.ctx.shadowOffsetY = this.upscale(
      font.yshad,
      this.playerResY,
      this.layers[0]?.canvas.height || this.playerResY
    );
    layer.ctx.shadowColor = blendAlpha(font.colors.c4, font.colors.a4);
    layer.ctx.lineWidth =
      this.upscale(font.xbord, this.playerResX, this.layers[0]?.canvas.width || this.playerResX) +
      this.upscale(font.ybord, this.playerResY, this.layers[0]?.canvas.height || this.playerResY);
    layer.ctx.lineCap = 'round';
    layer.ctx.lineJoin = 'round';
    layer.ctx.globalAlpha = font.opacity;

    // libass: the gaussian of \blur has sigma = blur * 2 / sqrt(ln 256) ≈ blur * 0.8493218
    const blurSigma =
      this.upscale(font.blur, this.playerResY, this.layers[0]?.canvas.height || this.playerResY) *
      0.8493218;
    // \be passes are [1 2 1] / 4 kernels in output pixels, not scaled: a variance of 1/2 each
    const beSigma = font.be > 0 ? Math.sqrt(font.be / 2) : 0;
    const sigma = Math.hypot(blurSigma, beSigma);
    layer.ctx.filter = sigma > 0 ? `blur(${sigma.toFixed(3)}px)` : 'none';
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
