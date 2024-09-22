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
  CustomAnimation
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

  insertLayers(sizes: OnInitSizes, insertAfter: HTMLCanvasElement) {
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

  getLayer(l: number): Layer | null {
    for (let i = 1; i < this.layers.length; i++) {
      if (this.layers[i]?.canvas.dataset.layer == l.toString()) {
        return this.layers[i] as Layer;
      }
    }
    return null;
  }

  findTotalLayers(ass: CompiledASS) {
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
    console.debug(dialogues);

    for (let i = 0; i < dialogues.length; i++) {
      const dia = dialogues[i] as Dialogue;
      const { layer, alignment, start, end, style, margin, slices, pos, move, org, fade } = dia;
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
        chars: this.processSlices(alignment, slices, computelayer)
      });
    }
  }

  processSlices(alignment: number, slices: DialogueSlice[], layer: Layer): Char[] {
    let chars: Char[] = [];
    slices.forEach((slice) => {
      const { style, fragments } = slice;
      let font = this.computeStyle(style, alignment, layer);

      let _frag: Char[] = [];

      fragments.forEach((frag) => {
        this.applyOverrideTag(frag.tag, font);
        this.applyFont(font, layer);

        //@ts-ignore
        const text = frag.text.replaceAll('\\N', '\n').split('');

        let ord = 0;
        let chars: Char[] = [];

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
              tag: frag.tag
            });

            ord += 1;
          }
        }

        _frag = _frag.concat(chars);
      });

      chars = chars.concat(_frag);
    });

    return chars;
  }

  sublog(type: LOGTYPE, ...message: any) {
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

  log(type: LOGTYPE, ...message: any) {
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

  render(timestamp: number) {
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
    // console.debug('STOPPED::');
    this.stop = true;
  }

  display(time: number) {
    this.currentTime = time;
    this.clear();
    const slicesToDisplay = this.getSlices(time);
    slicesToDisplay.forEach((dialogue) => {
      this.showDialogue(dialogue, time);
    });
  }

  charsToString(chars: Char[]): string {
    return chars.reduce((acc, v) => {
      return (acc += v.kind == CHARKIND.NEWLINE ? '\n' : v.c);
    }, '');
  }

  getSlices(time: number): PreProceesedAss[] {
    return this.ppass.filter((dialogue) => {
      return dialogue.start <= time && dialogue.end >= time;
    });
  }

  getLineHeights(layer: Layer, lines: Char[][]): number[] {
    let heights: number[] = [];

    let currentMaxHeight = 0;
    lines.forEach((line) => {
      line.forEach((char) => {
        if (char.kind === CHARKIND.NORMAL) {
          let font = this.computeStyle(char.style, 1, layer);
          this.applyOverrideTag(char.tag, font);
          this.applyFont(font, layer);
          let calc =
            layer.ctx.measureText(char.c).fontBoundingBoxAscent +
            layer.ctx.measureText(char.c).fontBoundingBoxDescent;
          if (calc > currentMaxHeight) {
            currentMaxHeight = calc;
          }
        }
      });
      heights.push(currentMaxHeight);
      currentMaxHeight = 0;
    });

    return heights;
  }

  countLines(chars: Char[]): number {
    return chars.filter((c) => c.kind === CHARKIND.NEWLINE).length + 1;
  }

  lineWidth(layer: Layer, chars: Char[]) {
    let w = 0;
    chars.forEach((char) => {
      if (char.kind === CHARKIND.NORMAL) {
        let font = this.computeStyle(char.style, 1, layer);
        this.applyOverrideTag(char.tag, font);
        this.applyFont(font, layer);
        w += layer.ctx.measureText(char.c).width + font.t.fsp;
      }
    });

    return w;
  }

  lines(chars: Char[]): Char[][] {
    let lines: Char[][] = [];
    let buff: Char[] = [];

    chars.forEach((char) => {
      switch (char.kind) {
        case CHARKIND.NEWLINE:
          lines.push(buff);
          buff = [];
          break;
        case CHARKIND.NORMAL:
          buff.push(char);
          break;
      }
    });

    if (buff.length > 0) {
      lines.push(buff);
    }

    return lines;
  }

  showDialogue(d: PreProceesedAss, time: number) {
    const layer = this.getLayer(d.layer);
    if (layer) {
      let font = this.computeStyle(d.style, d.alignment, layer);

      const lines = this.lines(d.chars);
      const lineHeights = this.getLineHeights(layer, lines);
      const lineHeight = Math.max(...lineHeights);
      const linesCount = this.countLines(d.chars);
      const totalHeight = lineHeight * linesCount;
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

      if (d.rotationOrigin)
        rotationOrigin = new Vector2(d.rotationOrigin.x * Xratio, d.rotationOrigin.y * Yratio);

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

      d.chars.forEach((char) => {
        switch (char.kind) {
          case CHARKIND.NEWLINE:
            cX = baseX;
            cY += lineHeight;
            break;
          case CHARKIND.NORMAL:
            font = this.computeStyle(char.style, d.alignment, layer);
            this.applyOverrideTag(char.tag, font);
            this.applyFont(font, layer);
            const w = layer.ctx.measureText(char.c).width + font.t.fsp;
            char.pos.x = cX;
            char.pos.y = cY;
            char.w = w;
            cX += w;
            break;
        }
      });

      const margin = this.upscaleMargin(d.margin);

      lines.forEach((line) => {
        // WARN: To debug
        const lineWidth = this.lineWidth(layer, line);

        if (!customPosition) {
          switch (font.textAlign) {
            case Align.Left:
              line.forEach((char) => {
                if (char.kind == CHARKIND.NORMAL) char.pos.x += margin.left;
              });
              break;
            case Align.Center:
              line.forEach((char) => {
                if (char.kind == CHARKIND.NORMAL)
                  char.pos.x += (layer.canvas.width - lineWidth) / 2;
              });
              break;
            case Align.Right:
              line.forEach((char) => {
                if (char.kind == CHARKIND.NORMAL)
                  char.pos.x += layer.canvas.width - lineWidth - margin.right;
              });
              break;
            default:
              line.forEach((char) => {
                if (char.kind == CHARKIND.NORMAL) char.pos.x += margin.left;
              });
              break;
          }
          switch (font.textBaseline) {
            case Baseline.Bottom:
              line.forEach((char) => {
                if (char.kind == CHARKIND.NORMAL)
                  char.pos.y +=
                    layer.canvas.height -
                    (lines.length > 1 ? totalHeight / lines.length : 0) -
                    margin.vertical;
              });
              break;
            case Baseline.Middle:
              line.forEach((char) => {
                if (char.kind == CHARKIND.NORMAL)
                  char.pos.y +=
                    (layer.canvas.height - totalHeight) / 2 +
                    (lines.length > 1 ? totalHeight / lines.length : lineHeight);
              });
              break;
            case Baseline.Top:
              line.forEach((char) => {
                if (char.kind == CHARKIND.NORMAL) char.pos.y += margin.vertical + lineHeight / 2;
              });
              break;
            default:
              line.forEach((char) => {
                if (char.kind == CHARKIND.NORMAL)
                  char.pos.y +=
                    layer.canvas.height -
                    (lines.length > 1 ? totalHeight / lines.length : 0) -
                    margin.vertical;
              });
              break;
          }
        } else {
          switch (font.textAlign) {
            case Align.Left:
              break;
            case Align.Center:
              line.forEach((char) => {
                if (char.kind == CHARKIND.NORMAL) char.pos.x -= lineWidth / 2;
              });
              break;
            case Align.Right:
              // line.forEach((char) => {
              //   if (char.kind == CHARKIND.NORMAL) char.pos.x += lineWidth;
              // });
              break;
            default:
              break;
          }
        }
      });

      let currentWord: Char[] = [];
      let currentFont: StyleDescriptor | null = null;
      let words: Word[] = [];

      let currentHash = 0;

      d.chars.forEach((char) => {
        if (char.kind == CHARKIND.NORMAL) {
          let font = this.computeStyle(char.style, d.alignment, layer);
          this.applyOverrideTag(char.tag, font);

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
        } else {
          if (currentFont !== null) {
            words.push({
              font: currentFont,
              value: currentWord,
              w: chunkCharWidth(currentWord)
            });

            currentWord = [];
            currentFont = null;
          }
        }
      });

      if (currentWord.length > 0) {
        if (currentFont !== null) {
          words.push({
            font: currentFont,
            value: currentWord,
            w: chunkCharWidth(currentWord)
          });

          currentWord = [];
          currentFont = null;
        }
      }

      words.forEach((word) => {
        word.font.opacity = currentOpacity;
        layer.ctx.save();
        this.drawWord(word, time, d.start, layer);
        layer.ctx.restore();
      });
    }
  }

  getFontHash(font: StyleDescriptor): number {
    return stringHash(JSON.stringify(font));
  }

  drawWord(word: Word, time: number, startTime: number, layer: Layer, debug = false) {
    let str = chunkCharToString(word.value);
    for (let i = 0; i < word.font.customAnimations.length; i++) {
      const ca = word.font.customAnimations[i] as CustomAnimation;
      if (startTime * 1000 + ca.t1 <= time * 1000 && time * 1000 <= startTime * 1000 + ca.t2) {
        const end = startTime * 1000 + ca.t2;
        const start = startTime * 1000 + ca.t1;
        const t = (time * 1000 - start) / (end - start);

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

    if (wordHead.kind === CHARKIND.NORMAL) {
      if (word.font.borderStyle !== 3) {
        if (word.font.xbord !== 0 || word.font.ybord !== 0) {
          layer.ctx.strokeText(str, wordHead.pos.x, wordHead.pos.y);
        }
      }

      let metrics = layer.ctx.measureText(str);

      layer.ctx.fillText(str, wordHead.pos.x, wordHead.pos.y);

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

  drawTextBackground(pos: Vector2, height: number, width: number, font: StyleDescriptor) {
    const layer = this.layers[0] as Layer;
    layer.ctx.save();
    layer.ctx.beginPath();
    layer.ctx.fillStyle = font.colors.c2;
    layer.ctx.fillRect(pos.x, pos.y - height, width, height);
    layer.ctx.closePath();
    layer.ctx.restore();
  }

  upscaleY(y: number, baseCanvasHeight: number) {
    const canvasHeight = this.layers[0]?.canvas.height || this.playerResY;
    return (canvasHeight * y) / baseCanvasHeight;
  }
  upscaleX(x: number, baseCanvasWidth: number) {
    const canvasWidth = this.layers[0]?.canvas.width || this.playerResX;
    return (canvasWidth * x) / baseCanvasWidth;
  }

  clearLayer(layer: number) {
    this.layers[layer]?.ctx.clearRect(
      0,
      0,
      this.layers[layer]?.canvas.width as number,
      this.layers[layer]?.canvas.height as number
    );
  }

  clear() {
    this.layers.forEach((layer) => {
      layer.ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
    });
  }

  upscalePosition(pos: Position) {
    return {
      x: this.upscale(pos.x, this.playerResX, this.layers[0]?.canvas.width || this.playerResX),
      y: this.upscale(pos.y, this.playerResY, this.layers[0]?.canvas.height || this.playerResY)
    };
  }

  upscaleMargin(margin: Margin) {
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

  applyOverrideTag(tag: CompiledTag, font: StyleDescriptor) {
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
  }

  upscale(x: number, firstcomp: number, secondcomp: number) {
    return (ruleOfThree(firstcomp, secondcomp) * x) / 100;
  }

  fontDecriptorString(font: StyleDescriptor) {
    return `${font.bold ? 'bold ' : ''}${font.italic ? 'italic ' : ''}${font.fontsize.toFixed(
      3
    )}px "${font.fontname}"`;
  }

  computeStyle(name: string, alignment: number, layer: Layer): StyleDescriptor {
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
      fe: fe,
      borderStyle: BorderStyle,
      opacity: 1,
      textAlign: this.getAlignment(alignment),
      textBaseline: this.getBaseLine(alignment)
    };

    this.applyFont(font, layer);

    return font;
  }

  applyFont(font: StyleDescriptor, layer: Layer) {
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
    layer.ctx.shadowBlur = this.upscale(
      font.blur,
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
  }

  getAlignment(alignment: number) {
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

  getBaseLine(alignment: number) {
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
