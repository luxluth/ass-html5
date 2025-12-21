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
  Clip
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
  parseAlpha
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

export class Renderer {
  compiledASS: CompiledASS;
  renderDiv: HTMLDivElement;
  layers: Layer[];
  numberOfLayers: number;
  video: HTMLVideoElement;
  playerResX: number;
  playerResY: number;
  stop: boolean = false;
  animationHandle: number | null = null;
  _log: LOGTYPE;
  ppass: PreProceesedAss[] = [];
  styles: Styles;
  collisions: 'Normal' | 'Reverse' = 'Normal';
  dt = 0;
  previous = 0;
  currentTime = 0;

  constructor(
    ass: CompiledASS,
    sizes: OnInitSizes,
    video: HTMLVideoElement,
    log: LOGTYPE,
    zIndex?: number
  ) {
    this._log = log;
    this.compiledASS = ass;
    this.styles = ass.styles;
    this.collisions = ass.collisions;
    if (this._log === 'DEBUG') {
      this.log('DEBUG', this.compiledASS);
    }
    this.playerResX = this.compiledASS.width;
    this.playerResY = this.compiledASS.height;
    this.renderDiv = newRender(sizes.y, sizes.x, sizes.width, sizes.height, zIndex, video);
    const background = newCanvas(sizes.width, sizes.height, -1, 'background', this.renderDiv);
    const bgCtx = background.getContext('2d') as CanvasRenderingContext2D;
    if (bgCtx === null) {
      throw new Error('Unable to initilize the Canvas 2D context');
    }
    this.layers = [
      {
        canvas: background,
        ctx: bgCtx
      }
    ];

    this.numberOfLayers = this.findTotalLayers(ass);
    this.insertLayers(sizes, background);
    this.video = video;
  }

  private insertLayers(sizes: OnInitSizes, insertAfter: HTMLCanvasElement) {
    for (let i = 0; i < this.numberOfLayers; i++) {
      const canvas = newCanvas(sizes.width, sizes.height, i, 'frame', undefined, insertAfter);
      const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
      if (ctx === null) {
        throw new Error('Unable to initilize the Canvas 2D context');
      }

      //@ts-ignore
      ctx.textRendering = 'geometricPrecision';

      this.layers.push({
        canvas: canvas,
        ctx: ctx
      });
    }
  }

  private getLayer(l: number): Layer | null {
    for (let i = 1; i < this.layers.length; i++) {
      if (this.layers[i]?.canvas.dataset.layer == l.toString()) {
        return this.layers[i] as Layer;
      }
    }
    return null;
  }

  private findTotalLayers(ass: CompiledASS) {
    let maxLayer = 1;
    ass.dialogues.forEach((dialogue) => {
      if (dialogue.layer >= maxLayer) maxLayer++;
    });

    return maxLayer;
  }

  async warmup() {
    const { dialogues } = this.compiledASS;
    const canvas = document.createElement('canvas');
    canvas.height = this.playerResY;
    canvas.width = this.playerResX;
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    const computelayer: Layer = {
      ctx,
      canvas
    };

    computelayer.canvas.width = this.playerResX;
    computelayer.canvas.height = this.playerResY;

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

      this.ppass.push({
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
        chars: this.processSlices(alignment, slices, computelayer),
        clip,
        q
      });
    }
  }

  private processSlices(alignment: number, slices: DialogueSlice[], layer: Layer): Char[] {
    let chars: Char[] = [];
    let currentKaraokeTime = 0;
    slices.forEach((slice) => {
      const { style, fragments } = slice;
      let font = this.computeStyle(style, alignment, layer);

      let _frag: Char[] = [];

      fragments.forEach((frag) => {
        this.applyOverrideTag(frag.tag, font);
        this.applyFont(font, layer);

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
        const text = frag.text.replaceAll('\\N', '\n').split('');
        const drawing = (frag as any).drawing as Drawing | undefined;

        let ord = 0;
        let chars: Char[] = [];

        if (drawing) {
          const scale = (frag.tag as any).p || 0;
          // If scale is 0, it's not a drawing (usually disabled), but if drawing object exists, it might be.
          // However, ass-compiler usually returns drawing object only if valid.
          // But p0 disables drawing. So check scale != 0.
          if (scale > 0) {
            const cachedPath = new Path2D(drawing.d);
            chars.push({
              kind: CHARKIND.DRAWING,
              pos: new Vector2(),
              w: drawing.width * Math.pow(2, -(scale - 1)),
              h: drawing.height * Math.pow(2, -(scale - 1)),
              tag: frag.tag,
              style,
              drawing,
              scale,
              path: cachedPath
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
    window.requestAnimationFrame((timestamp) => {
      this.previous = timestamp;
      this.animationHandle = requestAnimationFrame(this.render.bind(this));
    });
  }

  private render(timestamp: number) {
    if (this.stop === true) {
      if (this.animationHandle) {
        this.renderDiv.remove();
        cancelAnimationFrame(this.animationHandle);
      }
    } else {
      this.dt = (timestamp - this.previous) / 1000.0;
      this.previous = timestamp;
      this.display(this.video.currentTime);
      this.animationHandle = requestAnimationFrame(this.render.bind(this));
    }
  }

  destroy() {
    this.stop = true;
  }

  private display(time: number) {
    this.currentTime = time;
    this.clear();
    const slicesToDisplay = this.getSlices(time);
    slicesToDisplay.forEach((dialogue) => {
      this.showDialogue(dialogue, time);
    });
  }

  // private charsToString(chars: Char[]): string {
  //   return chars.reduce((acc, v) => {
  //     if (v.kind === CHARKIND.NEWLINE) return acc + '\n';
  //     if (v.kind === CHARKIND.NORMAL) return acc + v.c;
  //     return acc;
  //   }, '');
  // }

  private getSlices(time: number): PreProceesedAss[] {
    return this.ppass.filter((dialogue) => {
      return dialogue.start <= time && dialogue.end >= time;
    });
  }

  private getLineMetrics(layer: Layer, lines: Char[][]) {
    return lines.map((line) => {
      let maxAscent = 0;
      let maxDescent = 0;

      line.forEach((char) => {
        if (char.kind === CHARKIND.NORMAL) {
          let font = this.computeStyle(char.style, 1, layer);
          this.applyOverrideTag(char.tag, font);
          this.applyFont(font, layer);

          const m = layer.ctx.measureText(char.c);
          if (m.fontBoundingBoxAscent > maxAscent) maxAscent = m.fontBoundingBoxAscent;
          if (m.fontBoundingBoxDescent > maxDescent) maxDescent = m.fontBoundingBoxDescent;
        } else if (char.kind === CHARKIND.DRAWING) {
          const Yratio = layer.canvas.height / this.playerResY;
          const pScale = Math.pow(2, -(char.scale - 1));
          const fscy = (char.tag?.fscy ?? 100) / 100;

          const h = char.drawing.height * pScale * fscy * Yratio;

          if (h > maxAscent) maxAscent = h;
        }
      });

      return {
        ascent: maxAscent,
        height: maxAscent + maxDescent
      };
    });
  }

  private measureChar(layer: Layer, char: Char): number {
    if (char.kind === CHARKIND.NORMAL) {
      let font = this.computeStyle(char.style, 1, layer);
      this.applyOverrideTag(char.tag, font);
      this.applyFont(font, layer);
      return layer.ctx.measureText(char.c).width;
    } else if (char.kind === CHARKIND.DRAWING) {
      return char.w;
    }
    return 0;
  }

  private lineWidth(layer: Layer, chars: Char[]) {
    let w = 0;
    chars.forEach((char) => {
      w += this.measureChar(layer, char);
    });

    return w;
  }

  private lines(chars: Char[], layer: Layer, q: number, maxWidth: number): Char[][] {
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

      const charWidth = this.measureChar(layer, char);

      // Check if we need to wrap
      if (currentLineWidth + charWidth > maxWidth && currentLine.length > 0) {
        if (lastSafeBreakIndex !== -1) {
          // Break at the last space
          const line1 = currentLine.slice(0, lastSafeBreakIndex + 1);
          const overflowChars = currentLine.slice(lastSafeBreakIndex + 1);

          lines.push(line1);

          currentLine = overflowChars;
          // Recalculate width for the new line start
          currentLineWidth = this.lineWidth(layer, currentLine);
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
    const layer = this.getLayer(d.layer);
    if (!layer) return;

    layer.ctx.save();
    if (d.clip) {
      let activeClip = d.clip;
      for (const char of d.chars) {
        if (char.kind === CHARKIND.NORMAL && char.tag.t) {
          for (const anim of char.tag.t) {
            if (
              (anim.tag as any).clip &&
              d.start * 1000 + anim.t1 <= time * 1000 &&
              time * 1000 <= d.start * 1000 + anim.t2
            ) {
              const start = d.start * 1000 + anim.t1;
              const end = d.start * 1000 + anim.t2;
              let t = (time * 1000 - start) / (end - start);
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

    const lines = this.lines(d.chars, layer, d.q, maxWidth);
    const lineMetrics = this.getLineMetrics(layer, lines);
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
      let actualPosition = vectorLerp(
        startPosition,
        endPosition,
        (time - d.start) / (d.end - d.start)
      );

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
          offsetY = margin.vertical;
          break;
        default:
          offsetY = layer.canvas.height - margin.vertical - totalHeight;
          break;
      }
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
      const lineWidth = this.lineWidth(layer, line);
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

          font = this.computeStyle(char.style, d.alignment, layer);
          this.applyOverrideTag(char.tag, font);
          this.applyFont(font, layer);
          charWidth = layer.ctx.measureText(char.c).width;

          char.w = charWidth;
        } else if (char.kind === CHARKIND.DRAWING) {
          char.pos.x = cX;

          font = this.computeStyle(char.style, d.alignment, layer);
          this.applyOverrideTag(char.tag, font);
          const pScale = Math.pow(2, -(char.scale - 1));
          const dw = char.drawing.width * pScale * Xratio;
          const dh = char.drawing.height * pScale * Yratio;
          charWidth = dw;

          char.pos.y = baseline - dh;
          char.w = charWidth;
        }

        cX += charWidth;

        // Word Grouping (per line)
        if (char.kind == CHARKIND.NORMAL || char.kind == CHARKIND.DRAWING) {
          let fHash = this.getFontHash(font);
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
      const sx = scaleFactor * Xratio;
      const sy = scaleFactor * Yratio;

      const p = new Path2D(clip.drawing.d);

      if (typeof DOMMatrix !== 'undefined') {
        const matrix = new DOMMatrix().scale(sx, sy);
        const transformedPath = new Path2D();
        transformedPath.addPath(p, matrix);

        if (clip.inverse) {
          const finalPath = new Path2D();
          finalPath.rect(0, 0, layer.canvas.width, layer.canvas.height);
          finalPath.addPath(transformedPath);
          ctx.clip(finalPath, 'evenodd');
        } else {
          ctx.clip(transformedPath);
        }
      }
    }
  }

  private getFontHash(font: StyleDescriptor): number {
    return stringHash(JSON.stringify(font));
  }

  private drawWord(word: Word, time: number, startTime: number, layer: Layer, origin?: Vector2) {
    let str = chunkCharToString(word.value);
    for (let i = 0; i < word.font.customAnimations.length; i++) {
      const ca = word.font.customAnimations[i] as CustomAnimation;
      if (startTime * 1000 + ca.t1 <= time * 1000 && time * 1000 <= startTime * 1000 + ca.t2) {
        const end = startTime * 1000 + ca.t2;
        const start = startTime * 1000 + ca.t1;
        let t = (time * 1000 - start) / (end - start);
        if (ca.accel !== 1) {
          t = Math.pow(t, ca.accel);
        }

        for (const field in ca.tag) {
          switch (field) {
            case 'a1':
            case 'a3':
            case 'a4':
              word.font.colors[field] = lerp(
                255,
                Math.abs(parseAlpha(ca.tag[field] as string) - 255),
                t
              );
              break;
            case 'blur':
            case 'be':
            case 'xshad':
            case 'yshad':
            case 'xbord':
            case 'ybord':
              word.font[field] = lerp(0, ca.tag[field] as number, t);
              break;
            case 'fax':
            case 'fay':
            case 'frx':
            case 'fry':
            case 'frz':
            case 'fscx':
            case 'fscy':
              word.font.t[field] = lerp(0, ca.tag[field] as number, t);
              break;
            case 'fs':
              word.font.fontsize = this.upscale(
                lerp(0, ca.tag[field] as number, t),
                this.playerResY,
                this.layers[0]?.canvas.height || 0
              );
              break;
            case 'fsp':
              word.font.t.fsp = this.upscale(
                lerp(0, ca.tag[field] as number, t),
                this.playerResX,
                this.layers[0]?.canvas.width || this.playerResX
              );
              break;
            default:
              break;
          }
        }
      }
    }

    this.applyFont(word.font, layer);
    const wordHead = word.value[0] as Char;

    if (wordHead.kind === CHARKIND.DRAWING) {
      this.drawDrawing(wordHead, layer, word.font, origin);
      return;
    }

    if (wordHead.kind === CHARKIND.NORMAL) {
      this.applyTransform(layer.ctx, word.font, wordHead.pos, origin);
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

      if (word.font.borderStyle !== 3) {
        if (word.font.xbord !== 0 || word.font.ybord !== 0) {
          layer.ctx.strokeText(str, wordHead.pos.x, wordHead.pos.y);
        }
      }

      let metrics = layer.ctx.measureText(str);

      if (hasKaraoke) {
        layer.ctx.save();
        layer.ctx.fillStyle = blendAlpha(word.font.colors.c2, word.font.colors.a2);
        layer.ctx.fillText(str, wordHead.pos.x, wordHead.pos.y);
        layer.ctx.restore();

        layer.ctx.save();
        layer.ctx.beginPath();
        layer.ctx.rect(
          wordHead.pos.x,
          wordHead.pos.y - layer.canvas.height,
          clipWidth,
          layer.canvas.height * 2
        );
        layer.ctx.clip();

        layer.ctx.fillText(str, wordHead.pos.x, wordHead.pos.y);
        layer.ctx.restore();
      } else {
        layer.ctx.fillText(str, wordHead.pos.x, wordHead.pos.y);
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

      if (word.font.borderStyle === 3) {
        this.drawTextBackground(
          wordHead.pos,
          metrics.actualBoundingBoxAscent + metrics.fontBoundingBoxDescent,
          metrics.width,
          word.font
        );
      }
    }
  }

  private drawDrawing(
    char: Extract<Char, { kind: CHARKIND.DRAWING }>,
    layer: Layer,
    font: StyleDescriptor,
    origin?: Vector2
  ) {
    const { pos, path, scale } = char;
    const ctx = layer.ctx;

    ctx.save();

    this.applyTransform(ctx, font, pos, origin, true);

    const pScale = Math.pow(2, -(scale - 1));
    const t = font.t;
    const scaleX = t.fry ? Math.cos((t.fry * Math.PI) / 180) : 1;
    const scaleY = t.frx ? Math.cos((t.frx * Math.PI) / 180) : 1;
    const fscx = (t.fscx / 100) * scaleX;
    const fscy = (t.fscy / 100) * scaleY;

    const Xratio = layer.canvas.width / this.playerResX;
    const Yratio = layer.canvas.height / this.playerResY;

    const sx = fscx * pScale * Xratio;
    const sy = fscy * pScale * Yratio;

    ctx.translate(pos.x, pos.y);

    if (typeof DOMMatrix !== 'undefined' && 'addPath' in Path2D.prototype) {
      try {
        const matrix = new DOMMatrix().scale(sx, sy);

        const scaledPath = new Path2D();
        scaledPath.addPath(path, matrix);
        ctx.fill(scaledPath);
        if ((font.xbord ?? 0) > 0 || (font.ybord ?? 0) > 0) ctx.stroke(scaledPath);
      } catch (e) {
        this.fallbackDraw(ctx, path, sx, sy);
      }
    } else {
      this.fallbackDraw(ctx, path, sx, sy);
    }

    ctx.restore();
  }

  private fallbackDraw(ctx: CanvasRenderingContext2D, path: Path2D, sx: number, sy: number) {
    ctx.scale(sx, sy);
    ctx.fill(path);
    // NOTE: ctx.scale WILL distort the border thickness here.
    // e.g. a vertical line might have a thicker border than a horizontal one
    // if sx != sy.
    if (ctx.lineWidth > 0) ctx.stroke(path);
  }

  private applyTransform(
    ctx: CanvasRenderingContext2D,
    font: StyleDescriptor,
    pos: Vector2,
    origin?: Vector2,
    skipScaling = false
  ) {
    const t = font.t;
    const org = origin || pos;

    ctx.translate(org.x, org.y);

    if (t.frz) ctx.rotate((-t.frz * Math.PI) / 180);

    const scaleX = t.fry ? Math.cos((t.fry * Math.PI) / 180) : 1;
    const scaleY = t.frx ? Math.cos((t.frx * Math.PI) / 180) : 1;

    const fscx = (t.fscx / 100) * scaleX;
    const fscy = (t.fscy / 100) * scaleY;

    if (t.fax || t.fay) {
      ctx.transform(1, t.fay || 0, -(t.fax || 0), 1, 0, 0);
    }

    if (!skipScaling) {
      ctx.scale(fscx, fscy);
    }

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

  private clear() {
    this.layers.forEach((layer) => {
      layer.ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
    });
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
    if (tag.b !== undefined) font.bold = tag.b === 1;
    if (tag.i !== undefined) font.italic = tag.i === 1;
    if (tag.u !== undefined) font.underline = tag.u === 1;
    if (tag.s !== undefined) font.strikeout = tag.s === 1;
    if (tag.fn !== undefined) font.fontname = tag.fn;
    if (tag.q !== undefined) font.t.q = tag.q;
    if (tag.fs !== undefined)
      font.fontsize = this.upscale(tag.fs, this.playerResY, this.layers[0]?.canvas.height || 0);
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
    if (tag.c3 !== undefined) font.colors.c3 = swapBBGGRR(tag.c3);
    if (tag.c4 !== undefined) font.colors.c4 = swapBBGGRR(tag.c4);
    if (tag.a1 !== undefined) font.colors.a1 = parseAlpha(tag.a1);
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

  private fontDecriptorString(font: StyleDescriptor) {
    return `${font.bold ? 'bold ' : ''}${font.italic ? 'italic ' : ''}${font.fontsize.toFixed(
      3
    )}px "${font.fontname}"`;
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

    const font: StyleDescriptor = {
      fontsize: this.upscale(fs, this.playerResY, this.layers[0]?.canvas.height || this.playerResY),
      fontname: fn,
      bold: b === 1,
      italic: i === 1,
      underline: u === 1,
      strikeout: s === 1,
      colors: {
        c1: convertAegisubColorToHex(PrimaryColour),
        c2: convertAegisubColorToHex(SecondaryColour),
        c3: convertAegisubColorToHex(OutlineColour),
        c4,
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

    this.applyFont(font, layer);

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

    const blurRadius = this.upscale(
      font.blur + font.be,
      this.playerResY,
      this.layers[0]?.canvas.height || this.playerResY
    );
    layer.ctx.filter = blurRadius > 0 ? `blur(${blurRadius.toFixed(3)}px)` : 'none';
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
