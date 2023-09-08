import type { Renderer } from "./renderer";
import type { FontDescriptor, Styles } from "./types";
import type { Dialogue } from "ass-compiler";
import { blendAlpha, fontDecriptorString, makeLines, separateNewLine, splitTextOnTheNextCharacter, swapBBGGRR } from "./utils";
import { CompiledTag } from "ass-compiler/types/tags";
export class Drawing {
    r: Renderer
    dialogue: Dialogue
    styles: Styles

    textAlign: CanvasTextAlign = 'start'
    textBaseline: CanvasTextBaseline = 'alphabetic'

    constructor(
        r: Renderer,
        dialogue: Dialogue,
        styles: Styles
    ) {
        this.r = r
        this.dialogue = dialogue
        this.styles = styles
    }

    draw() {
        const { pos, org, move, clip, fade } = this.dialogue
        const { slices } = this.dialogue
        const { x, y } = this.r.upscalePosition(pos || org || { x: 0, y: 0 })
        const { x1, y1, x2, y2, t1, t2 } = move || { x1: 0, y1: 0, x2: 0, y2: 0, t1: 0, t2: 0 }
        const { inverse, scale, drawing, dots } = clip || {
            inverse: false,
            scale: 1,
            drawing: undefined,
            dots: undefined
        }
        
        slices.forEach((slice) => {
            const { alignment } = this.dialogue
            this.textAlign = this.r.getAlignment(alignment)
            this.textBaseline = this.r.getBaseLine(alignment)
            const font = this.r.computeStyle(slice.style, this.styles)
            this.applyFont(font)
            const lines = makeLines(slice.fragments.map((fragment) => {
                return fragment.text
            }))

            const lineHeights = lines.map(
                (line) =>
                    this.r.ctx.measureText(line).actualBoundingBoxAscent +
                    this.r.ctx.measureText(line).actualBoundingBoxDescent
            )

            const lineHeight = Math.max(...lineHeights)
            const totalHeight = lineHeight * lines.length

            const margin = this.r.upscaleMargin(this.dialogue.margin)

            let previousTextWidth = 0
            let currentLine = 0
            let y = 0

            switch (this.textBaseline) {
                case 'top':
                    y = margin.vertical + (lines.length > 1 ? totalHeight / lines.length : lineHeight)
                    break
                case 'middle':
                    y = (this.r.canvas.height - totalHeight) / 2 + lineHeight
                    break
                case 'bottom':
                    y = this.r.canvas.height - margin.vertical - (lines.length > 1 ? totalHeight / lines.length : 0)
                    break
                default:
                    y = margin.vertical + lineHeight
                    break
            }
            slice.fragments.forEach((fragment) => {
                this.applyOverrideTag(fragment.tag, font)
                const words = separateNewLine(splitTextOnTheNextCharacter(fragment.text))
                // console.debug(words)

                let lineWidth = this.r.ctx.measureText(lines[currentLine] as string).width
                let x = 0
                switch (this.textAlign) {
                    case 'left':
                        x = margin.left + previousTextWidth
                        break
                    case 'center':
                        x = (this.r.canvas.width - lineWidth) / 2 + previousTextWidth
                        break
                    case 'right':
                        x = this.r.canvas.width - margin.right - lineWidth + previousTextWidth
                        break
                    default:
                        x = margin.left + previousTextWidth
                        break
                }

                let currentWordsWidth = 0

                words.forEach((word) => {
                    let wordWidth = this.r.ctx.measureText(word).width
                    if (word === '\\N') {
                        // console.debug('y', y)
                        currentLine++
                        y += lineHeight
                        // console.debug('next-y', y)
                        previousTextWidth = 0
                        currentWordsWidth = 0
                        lineWidth = this.r.ctx.measureText(lines[currentLine] as string).width
                        switch (this.textAlign) {
                            case 'left':
                                x = margin.left
                                break
                            case 'center':
                                x = (this.r.canvas.width - lineWidth) / 2
                                break
                            case 'right':
                                x = this.r.canvas.width - margin.right - lineWidth
                                break
                            default:
                                x = margin.left
                        }
                    } else {
                        this.drawWord(word, x + currentWordsWidth, y, font)
                        currentWordsWidth += wordWidth
                        previousTextWidth += wordWidth
                    }
                })
            })
        })
    }

    drawWord(word: string, x: number, y: number, font: FontDescriptor, behindTextCanvas?: HTMLCanvasElement) {
        const debug = false
        // console.debug(`${this.ctx.font} ===?=== ${this.fontDecriptorString(font)}`)
        let baseY = y
        let yChanged = false
        this.r.ctx.save()
        this.r.ctx.beginPath()
        if (font.t.fscy !== 100 && font.t.fscx == 100) {
            // console.debug("stretch-y by", font.t.fscy / 100)
            y -= this.r.ctx.measureText(word).fontBoundingBoxAscent * (font.t.fscy / 100 - 1)
            this.r.ctx.scale(1, font.t.fscy / 100)
            yChanged = true
        } else if (font.t.fscx !== 100 && font.t.fscy == 100) {
            // console.debug("stretch-x by", font.t.fscx / 100)
            x -= this.r.ctx.measureText(word).width * (font.t.fscx / 100 - 1)
            this.r.ctx.scale(font.t.fscx / 100, 1)
        } else if (font.t.fscx !== 100 && font.t.fscy !== 100) {
            // console.debug("stretch-x-y", font.t.fscx / 100, font.t.fscy / 100)
            x -= this.r.ctx.measureText(word).width * (font.t.fscx / 100 - 1)
            y -= this.r.ctx.measureText(word).fontBoundingBoxAscent * (font.t.fscy / 100 - 1)
            this.r.ctx.scale(font.t.fscx / 100, font.t.fscy / 100)
            yChanged = true
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
                this.r.ctx.strokeText(word, x, y)
            }

        } // else {
        // 	// a border style of 3 is a filled box
        // 	this.ctx.save()
        // 	this.ctx.fillStyle = this.ctx.strokeStyle
        // 	this.ctx.fillRect(x, y - this.ctx.measureText(word).fontBoundingBoxAscent, this.ctx.measureText(word).width, this.ctx.measureText(word).fontBoundingBoxAscent + this.ctx.measureText(word).fontBoundingBoxDescent)
        // 	this.ctx.restore()
        // }

        this.r.ctx.fillText(word, x, y)

        if (debug) {
            // debug bounding box
            this.r.ctx.strokeStyle = "red"
            this.r.ctx.strokeRect(x, y - this.r.ctx.measureText(word).actualBoundingBoxAscent, this.r.ctx.measureText(word).width, this.r.ctx.measureText(word).actualBoundingBoxAscent + this.r.ctx.measureText(word).fontBoundingBoxDescent)
        }

        this.r.ctx.stroke();
        this.r.ctx.fill();
        this.r.ctx.closePath();
        this.r.ctx.restore();

        // return the height added by the word in more from the passed y
        return yChanged ? y - baseY + this.r.ctx.measureText(word).fontBoundingBoxAscent + this.r.ctx.measureText(word).fontBoundingBoxDescent : 0
    }

    applyFont(font: FontDescriptor) {
        this.r.ctx.fillStyle = blendAlpha(font.colors.c1, font.colors.a1)
        this.r.ctx.strokeStyle = blendAlpha(font.colors.c3, font.colors.a3)
        this.r.ctx.font = fontDecriptorString(font)
        this.r.ctx.shadowOffsetX = this.r.upscale(font.xshad, this.r.playerResX, this.r.canvas.width)
        this.r.ctx.shadowOffsetY = this.r.upscale(font.yshad, this.r.playerResY, this.r.canvas.height)
        this.r.ctx.shadowBlur = 0
        this.r.ctx.shadowColor = blendAlpha(font.colors.c4, font.colors.a4)
        this.r.ctx.lineWidth = this.r.upscale(font.xbord, this.r.playerResX, this.r.canvas.width) + this.r.upscale(font.ybord, this.r.playerResY, this.r.canvas.height)
        this.r.ctx.lineCap = 'round'
        this.r.ctx.lineJoin = 'round'
    }

    applyOverrideTag(tag: CompiledTag, font: FontDescriptor) {
        if (tag.b !== undefined) { font.bold = tag.b === 1 }
        if (tag.i !== undefined) { font.italic = tag.i === 1 }
        if (tag.u !== undefined) { font.underline = tag.u === 1 }
        if (tag.s !== undefined) { font.strikeout = tag.s === 1 }
        if (tag.fn !== undefined) { font.fontname = tag.fn }
        if (tag.fs !== undefined) { font.fontsize = this.r.upscale(tag.fs, this.r.playerResY, this.r.canvas.height) }
        if (tag.c1 !== undefined) { this.r.ctx.fillStyle = swapBBGGRR(tag.c1) }
        if (tag.a1 !== undefined) { this.r.ctx.fillStyle = blendAlpha(this.r.ctx.fillStyle as string, parseFloat(tag.a1)) }
        if (tag.c3 !== undefined) { this.r.ctx.strokeStyle = swapBBGGRR(tag.c3) }
        if (tag.a3 !== undefined) { this.r.ctx.strokeStyle = blendAlpha(this.r.ctx.strokeStyle as string, parseFloat(tag.a3)) }
        if (tag.c4 !== undefined) { this.r.ctx.shadowColor = swapBBGGRR(tag.c4) }
        if (tag.a4 !== undefined) { this.r.ctx.shadowColor = blendAlpha(this.r.ctx.shadowColor as string, parseFloat(tag.a4)) }
        if (tag.xshad !== undefined) { this.r.ctx.shadowOffsetX = this.r.upscale(tag.xshad, this.r.playerResX, this.r.canvas.width) }
        if (tag.yshad !== undefined) { this.r.ctx.shadowOffsetY = this.r.upscale(tag.yshad, this.r.playerResY, this.r.canvas.height) }
        if (tag.xbord !== undefined) {
            this.r.ctx.lineWidth = this.r.upscale(tag.xbord, this.r.playerResX, this.r.canvas.width)
            font.xbord = tag.xbord
        }
        if (tag.ybord !== undefined) {
            this.r.ctx.lineWidth = this.r.upscale(tag.ybord, this.r.playerResY, this.r.canvas.height)
            font.ybord = tag.ybord
        }
        if (tag.fscx !== undefined) { font.t.fscx = tag.fscx }
        if (tag.fscy !== undefined) { font.t.fscy = tag.fscy }
        if (tag.frz !== undefined) { font.t.frz = tag.frz }
        if (tag.frx !== undefined) { font.t.frx = tag.frx }
        if (tag.fry !== undefined) { font.t.fry = tag.fry }
        if (tag.fax !== undefined) { font.t.fax = tag.fax }
        if (tag.fay !== undefined) { font.t.fay = tag.fay }
        if (tag.fsp !== undefined) { font.t.fsp = this.r.upscale(tag.fsp, this.r.playerResX, this.r.canvas.width) }
        if (tag.blur !== undefined) { this.r.ctx.shadowBlur = this.r.upscale(tag.blur, this.r.playerResY, this.r.canvas.height) }
        this.r.ctx.font = fontDecriptorString(font)
        // console.debug("font", font, this.fontDecriptorString(font), "->", this.ctx.font)
    }

}
