import type { CompiledASS, CompiledASSStyle, Dialogue, DialogueSlice } from 'ass-compiler';
import type { CompiledTag } from 'ass-compiler/types/tags';
import type { FontDescriptor, Styles, Position, OnInitSizes, Layer, Margin, Char } from './types';
import { LOGTYPE } from './types';
import {
  ruleOfThree,
  blendAlpha,
  convertAegisubColorToHex,
  swapBBGGRR,
  newCanvas,
  newRender,
  Vector2
} from './utils';

type Ppass = {
  start: number;
  layer: number;
  end: number;
  style: string;
  margin: Margin;
  pos?: Position;
  alignment: number;
  slices: Array<Char[][]>;
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
  ppass: Ppass[] = [];
  styles: Styles;
  collisions: 'Normal' | 'Reverse' = 'Normal';

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
    if (this._log === LOGTYPE.DEBUG) {
      this.log(LOGTYPE.DEBUG, this.compiledASS);
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

    for (let i = 0; i < dialogues.length; i++) {
      const dia = dialogues[i] as Dialogue;
      const { layer, alignment, start, end, style, margin, slices, pos } = dia;
      this.ppass.push({
        start,
        layer,
        end,
        style,
        margin,
        alignment,
        pos,
        slices: this.processSlices(alignment, slices, computelayer)
      });
    }

    this.log(LOGTYPE.DEBUG, this.ppass);
  }

  processSlices(alignment: number, slices: DialogueSlice[], layer: Layer): Array<Char[][]> {
    let processValues: Array<Char[][]> = [];
    slices.forEach((slice) => {
      const { style, fragments } = slice;
      let font = this.computeStyle(style, alignment);
      this.applyFont(font, layer);

      fragments.forEach((frag) => {
        this.applyOverrideTag(frag.tag, font);
        this.applyFont(font, layer);

        const text = frag.text.replace('\\N', '\n').split('');

        let currentLine = 0;
        let chars: Char[] = [];
        let lines: Char[][] = [];

        for (let i = 0; i < text.length; i++) {
          const char = text[i] as string;
          if (char == '\n') {
            lines.push(chars);
            chars = [];
            currentLine += 1;
          } else {
            chars.push({
              pos: new Vector2(0, 0),
              c: char,
              ln: currentLine,
              w: 0,
              style,
              tag: frag.tag
            });
          }
        }

        if (chars.length > 0) {
          lines.push(chars);
          chars = [];
        }

        processValues.push(lines);
      });
    });

    return processValues;
  }

  sublog(type: LOGTYPE, ...message: any) {
    switch (type) {
      case LOGTYPE.DISABLE:
        break;
      case LOGTYPE.VERBOSE:
        console.info(type, ...message);
        break;
      case LOGTYPE.DEBUG:
        console.debug(type, ...message);
        break;
      case LOGTYPE.WARN:
        console.warn(type, ...message);
        break;
    }
  }

  log(type: LOGTYPE, ...message: any) {
    switch (this._log) {
      case LOGTYPE.DISABLE:
        break;
      case LOGTYPE.VERBOSE:
        this.sublog(type, message);
        break;
      case LOGTYPE.DEBUG:
        if (type == LOGTYPE.DEBUG) {
          this.sublog(type, message);
        }
        break;
      case LOGTYPE.WARN:
        if (type == LOGTYPE.WARN) {
          this.sublog(type, message);
        }
        break;
    }
  }

  async startRendering() {
    this.animationHandle = requestAnimationFrame(this.render.bind(this));
  }

  render() {
    if (this.stop === true) {
      if (this.animationHandle) {
        this.renderDiv.remove();
        cancelAnimationFrame(this.animationHandle);
      }
    } else {
      this.display(this.video.currentTime);
      this.animationHandle = requestAnimationFrame(this.render.bind(this));
    }
  }

  destroy() {
    this.stop = true;
  }

  display(time: number) {
    this.layers.forEach((layer) => {
      layer.ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
    });

    const slicesToDisplay = this.getSlices(time);
    slicesToDisplay.forEach((dialogue) => {
      this.showDialogue(dialogue);
    });
  }

  charsToString(chars: Char[]): string {
    return chars.reduce((acc, v) => {
      return (acc += v.c);
    }, '');
  }

  getSlices(time: number): Ppass[] {
    return this.ppass.filter((dialogue) => {
      return dialogue.start <= time && dialogue.end >= time;
    });
  }

  getOverrideStyle(time: number, dialogues: Dialogue[]) {
    return dialogues.filter((dialogue) => {
      return dialogue.start <= time && dialogue.end >= time;
    });
  }

  showDialogue(d: Ppass) {
    const layer = this.getLayer(d.layer);
    if (layer) {
      let font = this.computeStyle(d.style, d.alignment);
      this.applyFont(font, layer);

      d.slices.forEach((lines) => {
        const lineHeights = lines.reduce<number[]>((acc, line) => {
          return acc.concat(
            line.map(
              (char) =>
                layer.ctx.measureText(char.c).fontBoundingBoxAscent +
                layer.ctx.measureText(char.c).fontBoundingBoxDescent
            )
          );
        }, []);

        const lineHeight = Math.max(...lineHeights);
        const totalHeight = lineHeight * lines.length;
        let cX = 0;
        let cY = 0;
        let customPosition = false;
        // TODO: handle custom position
        if (d.pos) {
          customPosition = true;
          const Xratio = layer.canvas.width / this.playerResX;
          const Yratio = layer.canvas.height / this.playerResY;

          cX = d.pos.x * Xratio;
          cY = d.pos.y * Yratio;
        }

        lines.forEach((line) => {
          line.forEach((char) => {
            font = this.computeStyle(char?.style, d.alignment);
            this.applyOverrideTag(char.tag, font);
            this.applyFont(font, layer);
            const w = layer.ctx.measureText(char.c).width + font.t.fsp;
            char.pos.x = cX;
            char.pos.y = cY;
            char.w = w;
            cX += w;
          });
          cX = 0;
          cY += lineHeight;

          const margin = this.upscaleMargin(d.margin);

          let lineWidth = line.reduce((acc, char) => {
            return acc + char.w;
          }, 0);

          if (!customPosition) {
            switch (font.textAlign) {
              case 'left':
                line.forEach((char) => {
                  char.pos.x += margin.left;
                });
                break;
              case 'center':
                line.forEach((char) => {
                  char.pos.x += (layer.canvas.width - lineWidth) / 2;
                });
                break;
              case 'right':
                line.forEach((char) => {
                  char.pos.x += layer.canvas.width - lineWidth - margin.right;
                });
                break;
              default:
                line.forEach((char) => {
                  char.pos.x += margin.left;
                });
                break;
            }

            switch (font.textBaseline) {
              case 'bottom':
                line.forEach((char) => {
                  char.pos.y +=
                    layer.canvas.height -
                    (lines.length > 1 ? totalHeight / lines.length : 0) -
                    margin.vertical;
                });
                break;
              case 'middle':
                line.forEach((char) => {
                  char.pos.y +=
                    (layer.canvas.height - totalHeight) / 2 +
                    (lines.length > 1 ? totalHeight / lines.length : lineHeight);
                });
                break;
              case 'top':
                line.forEach((char) => {
                  char.pos.y += margin.vertical + lineHeight / 2;
                });
                break;
              default:
                line.forEach((char) => {
                  char.pos.y +=
                    layer.canvas.height -
                    (lines.length > 1 ? totalHeight / lines.length : 0) -
                    margin.vertical;
                });
                break;
            }
          } else {
            this.log(LOGTYPE.DEBUG, 'custom position');
          }

          line.forEach((char) => {
            let font = this.computeStyle(d.style, d.alignment);
            this.applyOverrideTag(char.tag, font);
            this.applyFont(font, layer);

            if (font.borderStyle !== 3) {
              if (font.xbord !== 0 || font.ybord !== 0) {
                layer.ctx.strokeText(char.c, char.pos.x, char.pos.y);
              }
            }

            layer.ctx.fillText(char.c, char.pos.x, char.pos.y);
          });
        });
      });
    }
  }

  drawTextBackground(text: string, pos: Position, height: number, font: FontDescriptor) {
    const layer = this.layers[0] as Layer;
    layer.ctx.save();
    layer.ctx.beginPath();
    layer.ctx.fillStyle = font.colors.c2;
    layer.ctx.fillRect(pos.x, pos.y - height, layer.ctx.measureText(text).width, height);
    layer.ctx.closePath();
    layer.ctx.restore();
  }

  drawWord(
    word: string,
    x: number,
    y: number,
    font: FontDescriptor,
    ctx: CanvasRenderingContext2D
  ) {
    const debug = false;
    // console.debug(`${this.ctx.font} ===?=== ${this.fontDecriptorString(font)}`)
    let baseY = y;
    let yChanged = false;
    ctx.save();
    ctx.beginPath();
    if (font.t.fscy !== 100 && font.t.fscx == 100) {
      // console.debug("stretch-y by", font.t.fscy / 100)
      y -= ctx.measureText(word).fontBoundingBoxAscent * (font.t.fscy / 100 - 1);
      ctx.scale(1, font.t.fscy / 100);
      yChanged = true;
    } else if (font.t.fscx !== 100 && font.t.fscy == 100) {
      // console.debug("stretch-x by", font.t.fscx / 100)
      x -= ctx.measureText(word).width * (font.t.fscx / 100 - 1);
      ctx.scale(font.t.fscx / 100, 1);
    } else if (font.t.fscx !== 100 && font.t.fscy !== 100) {
      // console.debug("stretch-x-y", font.t.fscx / 100, font.t.fscy / 100)
      x -= ctx.measureText(word).width * (font.t.fscx / 100 - 1);
      y -= ctx.measureText(word).fontBoundingBoxAscent * (font.t.fscy / 100 - 1);
      ctx.scale(font.t.fscx / 100, font.t.fscy / 100);
      yChanged = true;
    }

    // console.debug(word, x, y, this.textAlign, this.textBaseline)

    // font rotation
    // if (font.t.frz !== 0) {
    // 	let rotate = font.t.frz * (Math.PI / 180)
    // 	// rotate around the start of the word
    // 	this.ctx.translate(x, y)
    // 	// transformation matrix
    // 	this.ctx.transform(1, 0, Math.tan(rotate), 1, 0, 0)
    // }

    // Solution: Drawing the text on buffer canvas and then add it to the main canvas
    // That way, the font background is drawn on the buffer canvas and not on the main canvas
    // so the background doesn't overlap the other text
    if (font.borderStyle !== 3) {
      if (font.xbord !== 0 || font.ybord !== 0) {
        ctx.strokeText(word, x, y);
      }
    } // else {
    // 	// a border style of 3 is a filled box
    // 	this.ctx.save()
    // 	this.ctx.fillStyle = this.ctx.strokeStyle
    // 	this.ctx.fillRect(x, y - this.ctx.measureText(word).fontBoundingBoxAscent, this.ctx.measureText(word).width, this.ctx.measureText(word).fontBoundingBoxAscent + this.ctx.measureText(word).fontBoundingBoxDescent)
    // 	this.ctx.restore()
    // }

    ctx.fillText(word, x, y);

    if (debug) {
      // debug bounding box
      ctx.strokeStyle = 'red';
      ctx.strokeRect(
        x,
        y - ctx.measureText(word).actualBoundingBoxAscent,
        ctx.measureText(word).width,
        ctx.measureText(word).actualBoundingBoxAscent + ctx.measureText(word).fontBoundingBoxDescent
      );
    }

    if (font.borderStyle === 3) {
      // a border style of 3 is a filled box
      this.drawTextBackground(
        word,
        { x: x, y: y },
        ctx.measureText(word).actualBoundingBoxAscent +
          ctx.measureText(word).fontBoundingBoxDescent,
        font
      );
    }

    ctx.stroke();
    ctx.fill();
    ctx.closePath();
    ctx.restore();

    // return the height added by the word in more from the passed y
    return yChanged
      ? y -
          baseY +
          ctx.measureText(word).fontBoundingBoxAscent +
          ctx.measureText(word).fontBoundingBoxDescent
      : 0;
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

  applyOverrideTag(tag: CompiledTag, font: FontDescriptor) {
    if (tag.b !== undefined) {
      font.bold = tag.b === 1;
    }
    if (tag.i !== undefined) {
      font.italic = tag.i === 1;
    }

    if (tag.u !== undefined) {
      font.underline = tag.u === 1;
    }
    if (tag.s !== undefined) {
      font.strikeout = tag.s === 1;
    }
    if (tag.fn !== undefined) {
      font.fontname = tag.fn;
    }
    if (tag.fs !== undefined) {
      font.fontsize = this.upscale(tag.fs, this.playerResY, this.layers[0]?.canvas.height || 0);
    }
    if (tag.fscx !== undefined) {
      font.t.fscx = tag.fscx;
    }
    if (tag.fscy !== undefined) {
      font.t.fscy = tag.fscy;
    }
    if (tag.frz !== undefined) {
      font.t.frz = tag.frz;
    }
    if (tag.frx !== undefined) {
      font.t.frx = tag.frx;
    }
    if (tag.fry !== undefined) {
      font.t.fry = tag.fry;
    }
    if (tag.fax !== undefined) {
      font.t.fax = tag.fax;
    }
    if (tag.fay !== undefined) {
      font.t.fay = tag.fay;
    }
    if (tag.fsp !== undefined) {
      font.t.fsp = this.upscale(
        tag.fsp,
        this.playerResX,
        this.layers[0]?.canvas.width || this.playerResX
      );
    }
    for (let i = 0; i < this.layers.length; i++) {
      const layer = this.layers[i] as Layer;
      // layer.ctx.letterSpacing = '0px';
      if (tag.c1 !== undefined) {
        font.colors.c1 = swapBBGGRR(tag.c1);
        layer.ctx.fillStyle = font.colors.c1;
      }
      if (tag.a1 !== undefined) {
        font.colors.a1 = parseFloat(tag.a1);
        layer.ctx.fillStyle = blendAlpha(layer.ctx.fillStyle as string, font.colors.a1);
      }
      if (tag.c3 !== undefined) {
        font.colors.c3 = swapBBGGRR(tag.c3);
        layer.ctx.strokeStyle = font.colors.c3;
      }
      if (tag.a3 !== undefined) {
        font.colors.a3 = parseFloat(tag.a3);
        layer.ctx.strokeStyle = blendAlpha(layer.ctx.strokeStyle as string, font.colors.a3);
      }
      if (tag.c4 !== undefined) {
        font.colors.c4 = swapBBGGRR(tag.c4);
        layer.ctx.shadowColor = font.colors.c4;
      }
      if (tag.a4 !== undefined) {
        font.colors.a4 = parseFloat(tag.a4);
        layer.ctx.shadowColor = blendAlpha(layer.ctx.shadowColor as string, font.colors.a4);
      }
      if (tag.xshad !== undefined) {
        layer.ctx.shadowOffsetX = this.upscale(
          tag.xshad,
          this.playerResX,
          this.layers[0]?.canvas.width || this.playerResX
        );
        font.xshad = tag.xshad;
      }
      if (tag.yshad !== undefined) {
        layer.ctx.shadowOffsetY = this.upscale(
          tag.yshad,
          this.playerResY,
          this.layers[0]?.canvas.height || this.playerResY
        );
        font.yshad = tag.yshad;
      }
      if (tag.xbord !== undefined) {
        layer.ctx.lineWidth = this.upscale(
          tag.xbord,
          this.playerResX,
          this.layers[0]?.canvas.width || this.playerResX
        );
        font.xbord = tag.xbord;
      }
      if (tag.ybord !== undefined) {
        layer.ctx.lineWidth = this.upscale(
          tag.ybord,
          this.playerResY,
          this.layers[0]?.canvas.height || 0
        );
        font.ybord = tag.ybord;
      }
      if (tag.blur !== undefined) {
        layer.ctx.shadowBlur = this.upscale(
          tag.blur,
          this.playerResY,
          this.layers[0]?.canvas.height || 0
        );
        font.blur = tag.blur;
      }
      layer.ctx.font = this.fontDecriptorString(font);
      if (font.t.fsp) {
        layer.ctx.letterSpacing = `${font.t.fsp}px`;
      }
    }
    // console.debug("font", font, this.fontDecriptorString(font), "->", this.ctx.font)
  }

  upscale(x: number, firstcomp: number, secondcomp: number) {
    return (ruleOfThree(firstcomp, secondcomp) * x) / 100;
  }

  fontDecriptorString(font: FontDescriptor) {
    return `${font.bold ? 'bold ' : ''}${font.italic ? 'italic ' : ''}${font.fontsize.toFixed(
      3
    )}px "${font.fontname}"`;
  }

  computeStyle(name: string, alignment: number): FontDescriptor {
    const style = this.styles[name] as CompiledASSStyle;
    if (style === undefined) {
      // TODO: fallbackFont when there is no style
      this.log(LOGTYPE.WARN, `[ass-html5:renderer] no corresponding style "${name}" found`);
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

    const font: FontDescriptor = {
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
        a1: parseFloat(a1),
        a2: parseFloat(a2),
        a3: parseFloat(a3),
        a4: parseFloat(a4)
      },
      t: {
        fscx: fscx,
        fscy: fscy,
        frz: frz,
        frx: 0,
        fry: 0,
        fsp: this.upscale(fsp, this.playerResX, this.layers[0]?.canvas.width || this.playerResX),
        q: q
      },
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

    for (let i = 0; i < this.layers.length; i++) {
      const layer = this.layers[i] as Layer;
      this.applyFont(font, layer);
    }

    return font;
  }

  applyFont(font: FontDescriptor, layer: Layer) {
    layer.ctx.font = this.fontDecriptorString(font);
    layer.ctx.fillStyle = blendAlpha(font.colors.c1, font.colors.a1);
    layer.ctx.strokeStyle = blendAlpha(font.colors.c3, font.colors.a3);
    // layer.ctx.letterSpacing = `${font.t.fsp}px`;
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
        return 'left';
      case 2:
      case 5:
      case 8:
        return 'center';
      case 3:
      case 6:
      case 9:
        return 'right';
      default:
        return 'start';
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
        return 'bottom';
      case 4:
      case 5:
      case 6:
        return 'middle';
      case 7:
      case 8:
      case 9:
        return 'top';
      default:
        return 'alphabetic';
    }
  }
}
