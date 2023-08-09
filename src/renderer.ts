import type { CompiledASS, CompiledASSStyle, Dialogue } from 'ass-compiler'
import type { CompiledTag } from 'ass-compiler/types/tags'
import type { FontDescriptor, Override, Styles, Position } from './types'
import { 
    ruleOfThree, 
    blendAlpha, 
    makeLines, 
    splitTextOnTheNextCharacter, 
    separateNewLine,
    convertAegisubColorToHex,
    swapBBGGRR
} from './utils'

export class Renderer {
	compiledASS: CompiledASS
	canvas: HTMLCanvasElement
	ctx: CanvasRenderingContext2D
	video: HTMLVideoElement
	playerResX: number
	playerResY: number

	textAlign: CanvasTextAlign = 'start'
	textBaseline: CanvasTextBaseline = 'alphabetic'
	fontSpacing = 0

	constructor(parsedASS: CompiledASS, canvas: HTMLCanvasElement, video: HTMLVideoElement) {
		this.compiledASS = parsedASS
		this.playerResX = this.compiledASS.width
		this.playerResY = this.compiledASS.height
		this.canvas = canvas
		this.video = video
		this.ctx = canvas.getContext('2d') as CanvasRenderingContext2D
		if (this.ctx === null) {
			throw new Error('Unable to initilize the Canvas 2D context')
		}
		let data = [{ compiledASS: this.compiledASS }, { canvas: this.canvas }, { ctx: this.ctx }]
		// console.debug(data)
	}

	render() {
		this.video.addEventListener('timeupdate', () => {
			this.diplay(this.video.currentTime)
		})
	}

	destroy() {
		this.video.removeEventListener('timeupdate', () => {
			this.diplay(this.video.currentTime)
		})
	}

	redraw() {
		this.diplay(this.video.currentTime)
	}

	diplay(time: number) {
		this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)

		const { dialogues, styles } = this.compiledASS
		const dialoguesToDisplay = this.getOverrideStyle(time, dialogues)
		const overrides = dialoguesToDisplay.map((dialogue) => {
			return {
				dialogue: dialogue,
				style: styles[dialogue.style] as CompiledASSStyle
			}
		}) as Override[]
		// console.debug(overrides)

		this.showText(overrides, styles)
	}

	getOverrideStyle(time: number, dialogues: Dialogue[]) {
		return dialogues.filter((dialogue) => {
			return dialogue.start <= time && dialogue.end >= time
		})
	}

	showText(overrides: Override[], styles: Styles) {
		overrides.forEach((override) => {
			const { dialogue } = override
			this.computeStyle(dialogue.style, styles, dialogue.alignment)
			this.drawText(dialogue, styles)
		})
	}

    flatStrArr(arr: string[]) {
       return arr.join("\\N") 
    }

    resampleLinesOnOverflow(lines: string[]): string[] {
        const resultLines: string[] = [];
        const maxWidth = this.canvas.width;

        for (const line of lines) {
            const textWidth = this.ctx.measureText(line).width;

            if (textWidth <= maxWidth) {
                resultLines.push(line);
            } else {
                const words = splitTextOnTheNextCharacter(line)
                let currentLine = '';
                for (const word of words) {
                    const testLine = currentLine ? `${currentLine}${word}` : word;
                    const testWidth = this.ctx.measureText(testLine).width;
                    if (testWidth <= maxWidth) {
                        currentLine = testLine;
                    } else {
                        resultLines.push(currentLine);
                        currentLine = word;
                    }
                }
                if (currentLine) {
                    resultLines.push(currentLine);
                }
            }
        }

        return resultLines;
    }

	drawText(dialogue: Dialogue, styles: Styles) {
		const { slices, pos, move } = dialogue
		if (typeof pos !== 'undefined') {
			this.drawTextAtPosition(dialogue, styles, pos)
			return
		} else if (typeof move !== 'undefined') {
			let pos = {
				x: move.x1,
				y: move.y1
			}
			this.drawTextAtPosition(dialogue, styles, pos)
			return
		}
		slices.forEach((slice) => {
			const font = this.computeStyle(slice.style, styles, dialogue.alignment)
			const lines = makeLines(slice.fragments.map((fragment) => {
				// return this.flatStrArr(this.resampleLinesOnOverflow([fragment.text]))
                return fragment.text
			}))

            // console.debug(lines)
			
            // console.debug(this.resampleLinesOnOverflow(lines))
			
            const lineHeights = lines.map(
				(line) =>
					this.ctx.measureText(line).actualBoundingBoxAscent +
					this.ctx.measureText(line).actualBoundingBoxDescent
			)

			const lineHeight = Math.max(...lineHeights)
			const totalHeight = lineHeight * lines.length
			
			const margin = this.upscaleMargin(dialogue.margin)

			let previousTextWidth = 0
			let currentLine = 0
			let y = 0

			switch (this.textBaseline) {
				case 'top':
					y = margin.vertical + (lines.length > 1 ? totalHeight / lines.length : lineHeight)
					break
				case 'middle':
					y = (this.canvas.height - totalHeight) / 2 + lineHeight
					break
				case 'bottom':
					y = this.canvas.height - margin.vertical - (lines.length > 1 ? totalHeight / lines.length : 0)
					break
				default:
					y = margin.vertical + lineHeight
					break
			}

			slice.fragments.forEach((fragment) => {
				this.applyOverrideTag(fragment.tag, font)
				const words = separateNewLine(splitTextOnTheNextCharacter(fragment.text))
				// console.debug(words)
				
				let lineWidth = this.ctx.measureText(lines[currentLine] as string).width
				let x = 0
				switch (this.textAlign) {
					case 'left':
						x = margin.left + previousTextWidth
						break
					case 'center':
						x = (this.canvas.width - lineWidth) / 2 + previousTextWidth
						break
					case 'right':
						x = this.canvas.width - margin.right - lineWidth + previousTextWidth
						break
					default:
						x = margin.left + previousTextWidth
						break
				}

				let currentWordsWidth = 0

				words.forEach((word) => {
					let wordWidth = this.ctx.measureText(word).width
					if (word === '\\N') {
						// console.debug('y', y)
						currentLine++
						y += lineHeight
						// console.debug('next-y', y)
						previousTextWidth = 0
						currentWordsWidth = 0
						lineWidth = this.ctx.measureText(lines[currentLine] as string).width
						switch (this.textAlign) {
							case 'left':
								x = margin.left
								break
							case 'center':
								x = (this.canvas.width - lineWidth) / 2
								break
							case 'right':
								x = this.canvas.width - margin.right - lineWidth
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

	drawTextAtPosition(
		dialogue: Dialogue,
		styles: Styles,
		pos: Position,
	) {
		pos = this.upscalePosition(pos)
		const { slices } = dialogue
		slices.forEach((slice) => {
			const font = this.computeStyle(slice.style, styles, dialogue.alignment)
			const lines = makeLines(slice.fragments.map((fragment) => {
				return fragment.text
			}))


			const lineHeights = lines.map(
				(line) =>
					this.ctx.measureText(line).actualBoundingBoxAscent +
					this.ctx.measureText(line).actualBoundingBoxDescent
			)
			
			let previousTextWidth = 0
			let currentLine = 0
			let lineHeight = Math.max(...lineHeights)
			let y = pos.y

			switch (this.textBaseline) {
				case 'top':
					y += lineHeight
					break
				case 'middle':
					y += lineHeight / 2
					break
				case 'bottom':
					y -= lineHeight
					break
				default:
					y += lineHeight
					break
			}

			slice.fragments.forEach((fragment) => {
				// console.debug("frag", fragment)
				let x = pos.x
				this.applyOverrideTag(fragment.tag, font)
				let words = separateNewLine(splitTextOnTheNextCharacter(fragment.text))
				words = words.filter((word) => word !== '')
				// console.debug("words", words)

				let lineWidth = this.ctx.measureText(lines[currentLine] as string).width
				switch (this.textAlign) {
					case 'left':
						x += previousTextWidth
						break
					case 'center':
						x += previousTextWidth - lineWidth / 2
						break
					case 'right':
						x -= lineWidth + previousTextWidth
						break
					default:
						x += previousTextWidth
						break
				}

				let currentWordsWidth = 0
				let plusH = 0
				words.forEach((word) => {
					if (word === '\\N') {
						currentLine++
						y += lineHeight + plusH
						previousTextWidth = 0
						currentWordsWidth = 0
						lineWidth = this.ctx.measureText(lines[currentLine] as string).width
						switch (this.textAlign) {
							case 'left':
								x = pos.x
								break
							case 'center':
								x = pos.x - lineWidth / 2
								break
							case 'right':
								x = pos.x - lineWidth
								break
							default:
								x = pos.x
						}
					} else {
						let wordWidth = this.ctx.measureText(word).width
						// console.debug("word", `'${word}'`, wordWidth)
						plusH = this.drawWord(word, x + currentWordsWidth, y, font)
						currentWordsWidth += wordWidth
						previousTextWidth += wordWidth
					}
				})
			})
		})
	}
	
    drawWord(word: string, x: number, y: number, font: FontDescriptor, debug = false) {
		// console.debug(`${this.ctx.font} ===?=== ${this.fontDecriptorString(font)}`)
		let baseY = y
		let yChanged = false
		this.ctx.save()
        this.ctx.beginPath()
        if (font.t.fscy !== 100 && font.t.fscx == 100) {
            // console.debug("stretch-y by", font.t.fscy / 100)
			y -= this.ctx.measureText(word).actualBoundingBoxAscent * (font.t.fscy / 100 - 1)
            this.ctx.scale(1, font.t.fscy / 100)
			yChanged = true
        } else if (font.t.fscx !== 100 && font.t.fscy == 100) {
            // console.debug("stretch-x by", font.t.fscx / 100)
			x -= this.ctx.measureText(word).width * (font.t.fscx / 100 - 1)
            this.ctx.scale(font.t.fscx / 100, 1)
        } else if (font.t.fscx !== 100 && font.t.fscy !== 100) {
            // console.debug("stretch-x-y", font.t.fscx / 100, font.t.fscy / 100)
			x -= this.ctx.measureText(word).width * (font.t.fscx / 100 - 1)
			y -= this.ctx.measureText(word).actualBoundingBoxAscent * (font.t.fscy / 100 - 1)
            this.ctx.scale(font.t.fscx / 100, font.t.fscy / 100)
			yChanged = true
        }

		// console.debug(word, x, y, this.textAlign, this.textBaseline)

		
        if (font.xbord !== 0 || font.ybord !== 0) {
			this.ctx.strokeText(word, x, y)
        }
		
        this.ctx.fillText(word, x, y)
		
		if (debug) {
			// debug bounding box
			this.ctx.strokeStyle = "red"
			this.ctx.strokeRect(x, y - this.ctx.measureText(word).actualBoundingBoxAscent, this.ctx.measureText(word).width, this.ctx.measureText(word).actualBoundingBoxAscent + this.ctx.measureText(word).actualBoundingBoxDescent)
		}
		
		this.ctx.stroke();
		this.ctx.fill();
		this.ctx.closePath();
        this.ctx.restore();

		// return the height added by the word in more from the passed y
		return yChanged ? y - baseY + this.ctx.measureText(word).actualBoundingBoxAscent + this.ctx.measureText(word).actualBoundingBoxDescent : 0
    }

	upscalePosition(pos: Position) {
		return {
			x: this.upscale(pos.x, this.playerResX, this.canvas.width),
			y: this.upscale(pos.y, this.playerResY, this.canvas.height)
		}
	}

	upscaleMargin(margin: {
		left: number;
		right: number;
		vertical: number;
	}) {
		return {
			left: this.upscale(margin.left, this.playerResX, this.canvas.width),
			right: this.upscale(margin.right, this.playerResX, this.canvas.width),
			vertical: this.upscale(margin.vertical, this.playerResY, this.canvas.height)
		}
	}

	applyOverrideTag(tag: CompiledTag, font: FontDescriptor) {
		if (tag.b !== undefined) { font.bold = tag.b === 1 }
		if (tag.i !== undefined) { font.italic = tag.i === 1 }
		if (tag.u !== undefined) { font.underline = tag.u === 1 }
		if (tag.s !== undefined) { font.strikeout = tag.s === 1 }
		if (tag.fn !== undefined) { font.fontname = tag.fn }
		if (tag.fs !== undefined) { font.fontsize = this.upscale(tag.fs, this.playerResY, this.canvas.height) }
		if (tag.c1 !== undefined) { this.ctx.fillStyle = swapBBGGRR(tag.c1) }
		if (tag.a1 !== undefined ) { this.ctx.fillStyle = blendAlpha(this.ctx.fillStyle as string, parseFloat(tag.a1)) }
		if (tag.c3 !== undefined) { this.ctx.strokeStyle = swapBBGGRR(tag.c3) }
		if (tag.a3 !== undefined) { this.ctx.strokeStyle = blendAlpha(this.ctx.strokeStyle as string, parseFloat(tag.a3)) }
		if (tag.c4 !== undefined) { this.ctx.shadowColor = swapBBGGRR(tag.c4) }
		if (tag.a4 !== undefined) { this.ctx.shadowColor = blendAlpha(this.ctx.shadowColor as string, parseFloat(tag.a4)) }
		if (tag.xshad !== undefined) { this.ctx.shadowOffsetX = this.upscale(tag.xshad, this.playerResX, this.canvas.width) }
		if (tag.yshad !== undefined) { this.ctx.shadowOffsetY = this.upscale(tag.yshad, this.playerResY, this.canvas.height) }
		if (tag.xbord !== undefined) { 
			this.ctx.lineWidth = this.upscale(tag.xbord, this.playerResX, this.canvas.width)
			font.xbord = tag.xbord 
		}
		if (tag.ybord !== undefined) { 
			this.ctx.lineWidth = this.upscale(tag.ybord, this.playerResY, this.canvas.height)
			font.ybord = tag.ybord
		}
		if (tag.fscx !== undefined) {font.t.fscx = tag.fscx}
		if (tag.fscy !== undefined) {font.t.fscy = tag.fscy}
		if (tag.frz !== undefined) {font.t.frz   = tag.frz}
		if (tag.frx !== undefined) {font.t.frx   = tag.frx}
		if (tag.fry !== undefined) {font.t.fry   = tag.fry}
		if (tag.fax !== undefined) {font.t.fax   = tag.fax}
		if (tag.fay !== undefined) {font.t.fay   = tag.fay}
		if (tag.fsp !== undefined) {font.t.fsp   = this.upscale(tag.fsp, this.playerResX, this.canvas.width)}
		if (tag.blur !== undefined) { this.ctx.shadowBlur = this.upscale(tag.blur, this.playerResY, this.canvas.height) }
		if (tag.pbo)
		this.ctx.font = this.fontDecriptorString(font)
		// console.debug("font", font, this.fontDecriptorString(font), "->", this.ctx.font)
		return font
	}

	upscale(x: number, firstcomp: number, secondcomp: number) {
		return (ruleOfThree(firstcomp, secondcomp) * x) / 100
	}

	fontDecriptorString(font: FontDescriptor) {
		return `${font.bold ? 'bold ' : ''}${font.italic ? 'italic ' : ''}${font.fontsize.toFixed(3)}px "${font.fontname}"`
	}

	computeStyle(name: string, styles: { [styleName: string]: CompiledASSStyle }, alignment: number) {
		const style = styles[name] as CompiledASSStyle
		if (style === undefined) {
			console.warn(`[ass-html5:Renderer] Style ${name} not found`)
		}
		const {
			fn, // font name
			fs, // font size
			a1, // primary alpha
			// c2, // secondary color
			// a2, // secondary alpha
			a3, // outline alpha
			c4, // shadow color
			a4, // shadow alpha
			b,  // bold
			i,  // italic
			u,  // underline
			s,  // strikeout
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
		} = style.tag
        
        const { PrimaryColour, OutlineColour } = style.style
		
        const font: FontDescriptor = {
			fontsize: this.upscale(fs, this.playerResY, this.canvas.height),
			fontname: fn,
			bold: b === 1,
			italic: i === 1,
			underline: u === 1,
			strikeout: s === 1,
			t: {
				fscx: fscx,
				fscy: fscy,
				frz: frz,
				frx: 0,
				fry: 0,
				q: q
			},
			xbord: xbord,
			ybord: ybord,
			fe: fe,
		}

		this.textAlign = this.getAlignment(alignment)
		this.textBaseline = this.getBaseLine(alignment)
		this.fontSpacing = this.upscale(fsp, this.playerResX, this.canvas.width)
		this.ctx.fillStyle = blendAlpha(convertAegisubColorToHex(PrimaryColour), parseFloat(a1))
		this.ctx.strokeStyle = blendAlpha(convertAegisubColorToHex(OutlineColour), parseFloat(a3))
		this.ctx.font = this.fontDecriptorString(font)
		this.ctx.shadowOffsetX = this.upscale(xshad, this.playerResX, this.canvas.width)
		this.ctx.shadowOffsetY = this.upscale(yshad, this.playerResY, this.canvas.height)
		this.ctx.shadowBlur = 0
		this.ctx.shadowColor = blendAlpha(c4, parseFloat(a4))
		this.ctx.lineWidth = this.upscale(xbord, this.playerResX, this.canvas.width) + this.upscale(ybord, this.playerResY, this.canvas.height)
		this.ctx.lineCap = 'round'
		this.ctx.lineJoin = 'round'
		return font
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
				return 'left'
			case 2:
			case 5:
			case 8:
				return 'center'
			case 3:
			case 6:
			case 9:
				return 'right'
			default:
				return 'start'
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
				return 'bottom'
			case 4:
			case 5:
			case 6:
				return 'middle'
			case 7:
			case 8:
			case 9:
				return 'top'
			default:
				return 'alphabetic'
		}
	}
}
