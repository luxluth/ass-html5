import type { CompiledASS, CompiledASSStyle, Dialogue, DialogueFragment } from 'ass-compiler'
import type { CompiledTag } from 'ass-compiler/types/tags'
import type {
	FontDescriptor,
	Override,
	Styles,
	Position,
	OnInitSizes,
	ASSAnimation,
	Layer
} from './types'
import { SimpleDrawing, AnimateDrawing, SpecificPositionDrawing } from './drawing'
import {
	ruleOfThree,
	blendAlpha,
	splitTextOnTheNextCharacter,
	convertAegisubColorToHex,
	swapBBGGRR,
	newCanvas,
	newRender
} from './utils'

export class Renderer {
	compiledASS: CompiledASS
	renderDiv: HTMLDivElement
	layers: Layer[]
	numberOfLayers: number
	video: HTMLVideoElement
	playerResX: number
	playerResY: number

	textAlign: CanvasTextAlign = 'start'
	textBaseline: CanvasTextBaseline = 'alphabetic'
	fontSpacing = 0

	constructor(ass: CompiledASS, sizes: OnInitSizes, video: HTMLVideoElement, zIndex?: number) {
		this.compiledASS = ass
		this.playerResX = this.compiledASS.width
		this.playerResY = this.compiledASS.height
		this.renderDiv = newRender(sizes.y, sizes.x, sizes.width, sizes.height, zIndex, video)
		const background = newCanvas(sizes.width, sizes.height, -1, 'background', this.renderDiv)
		const bgCtx = background.getContext('2d') as CanvasRenderingContext2D
		if (bgCtx === null) {
			throw new Error('Unable to initilize the Canvas 2D context')
		}
		this.layers = [
			{
				canvas: background,
				ctx: bgCtx
			}
		]

		this.numberOfLayers = this.findTotalLayers(ass)
		this.insertLayers(sizes, background)
		this.video = video
	}

	insertLayers(sizes: OnInitSizes, insertAfter: HTMLCanvasElement) {
		for (let i = 0; i < this.numberOfLayers; i++) {
			const canvas = newCanvas(sizes.width, sizes.height, i, 'frame', undefined, insertAfter)
			const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
			if (ctx === null) {
				throw new Error('Unable to initilize the Canvas 2D context')
			}

			this.layers.push({
				canvas: canvas,
				ctx: ctx
			})
		}
	}

	getLayer(l: number): Layer | null {
		for (let i = 1; i < this.layers.length; i++) {
			if (this.layers[i]?.canvas.dataset.layer == l.toString()) {
				return this.layers[i] as Layer
			}
		}
		return null
	}

	findTotalLayers(ass: CompiledASS) {
		let maxLayer = 1
		ass.dialogues.forEach((dialogue) => {
			if (dialogue.layer >= maxLayer) maxLayer++
		})

		return maxLayer
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
		this.layers.forEach((layer) => {
			layer.ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height)
		})

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
			this.computeStyle(override.dialogue.style, styles, override.dialogue.alignment)
			this.drawText(override.dialogue, styles)
		})
	}

	flatStrArr(arr: string[]) {
		return arr.join('\\N')
	}

	drawText(dialogue: Dialogue, styles: Styles) {
		const { pos, move, fade, org } = dialogue
		if (typeof pos !== 'undefined') {
			new SpecificPositionDrawing(this, dialogue, styles, pos).draw()
			return
		} else if (
			typeof move !== 'undefined' ||
			typeof fade !== 'undefined' ||
			typeof org !== 'undefined'
		) {
			let animations = []
			if (typeof move !== 'undefined') {
				animations.push({
					name: 'move',
					values: [move.x1, move.y1, move.x2, move.y2, move.t1, move.t2]
				} as ASSAnimation.Move)
			}
			if (typeof fade !== 'undefined') {
				if (fade.type === 'fad') {
					animations.push({
						name: 'fad',
						values: [fade.t1, fade.t2]
					} as ASSAnimation.Fade)
				} else if (fade.type === 'fade') {
					animations.push({
						name: 'fade',
						values: [fade.a1, fade.a2, fade.a3, fade.t1, fade.t2, fade.t3, fade.t4]
					} as ASSAnimation.Fade)
				}
			}
			if (typeof org !== 'undefined') {
				animations.push({
					name: 'org',
					values: [org.x, org.y]
				} as ASSAnimation.Org)
			}
			new AnimateDrawing(this, dialogue, styles, animations).draw()
		} else {
			new SimpleDrawing(this, dialogue, styles).draw()
		}
	}

	drawTextBackground(
		lines: string[],
		currentLine: number,
		pos: Position,
		font: FontDescriptor,
		y: number,
		fragments: DialogueFragment[]
	) {
		const layer = this.layers[0] as Layer
		fragments.forEach((fragment) => {
			let x = pos.x
			this.applyOverrideTag(fragment.tag, font)
			const lineWidth =
				layer.ctx.measureText(lines[currentLine] as string).width +
				layer.ctx.measureText(' ').width * 2
			const words = splitTextOnTheNextCharacter(lines[currentLine] as string)

			// finding the biggest word height
			let lineHeight = 0
			words.forEach((word) => {
				let wordHeight =
					layer.ctx.measureText(word).fontBoundingBoxAscent +
					layer.ctx.measureText(word).fontBoundingBoxDescent
				if (wordHeight > lineHeight) {
					lineHeight = wordHeight
				}
			})

			switch (this.textAlign) {
				case 'left':
					x += 0
					break
				case 'center':
					x -= lineWidth / 2
					break
				case 'right':
					x -= lineWidth
					break
				default:
					x += 0
					break
			}

			layer.ctx.fillStyle = layer.ctx.strokeStyle
			layer.ctx.fillRect(x, y - lineHeight, lineWidth, lineHeight)
			currentLine++
			y += lineHeight
		})
	}

	drawWord(
		word: string,
		x: number,
		y: number,
		font: FontDescriptor,
		ctx: CanvasRenderingContext2D,
		behindTextCanvas?: HTMLCanvasElement
	) {
		const debug = false
		// console.debug(`${this.ctx.font} ===?=== ${this.fontDecriptorString(font)}`)
		let baseY = y
		let yChanged = false
		ctx.save()
		ctx.beginPath()
		if (font.t.fscy !== 100 && font.t.fscx == 100) {
			// console.debug("stretch-y by", font.t.fscy / 100)
			y -= ctx.measureText(word).fontBoundingBoxAscent * (font.t.fscy / 100 - 1)
			ctx.scale(1, font.t.fscy / 100)
			yChanged = true
		} else if (font.t.fscx !== 100 && font.t.fscy == 100) {
			// console.debug("stretch-x by", font.t.fscx / 100)
			x -= ctx.measureText(word).width * (font.t.fscx / 100 - 1)
			ctx.scale(font.t.fscx / 100, 1)
		} else if (font.t.fscx !== 100 && font.t.fscy !== 100) {
			// console.debug("stretch-x-y", font.t.fscx / 100, font.t.fscy / 100)
			x -= ctx.measureText(word).width * (font.t.fscx / 100 - 1)
			y -= ctx.measureText(word).fontBoundingBoxAscent * (font.t.fscy / 100 - 1)
			ctx.scale(font.t.fscx / 100, font.t.fscy / 100)
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
				ctx.strokeText(word, x, y)
			}
		} // else {
		// 	// a border style of 3 is a filled box
		// 	this.ctx.save()
		// 	this.ctx.fillStyle = this.ctx.strokeStyle
		// 	this.ctx.fillRect(x, y - this.ctx.measureText(word).fontBoundingBoxAscent, this.ctx.measureText(word).width, this.ctx.measureText(word).fontBoundingBoxAscent + this.ctx.measureText(word).fontBoundingBoxDescent)
		// 	this.ctx.restore()
		// }

		ctx.fillText(word, x, y)

		if (debug) {
			// debug bounding box
			ctx.strokeStyle = 'red'
			ctx.strokeRect(
				x,
				y - ctx.measureText(word).actualBoundingBoxAscent,
				ctx.measureText(word).width,
				ctx.measureText(word).actualBoundingBoxAscent + ctx.measureText(word).fontBoundingBoxDescent
			)
		}

		ctx.stroke()
		ctx.fill()
		ctx.closePath()
		ctx.restore()

		// return the height added by the word in more from the passed y
		return yChanged
			? y -
					baseY +
					ctx.measureText(word).fontBoundingBoxAscent +
					ctx.measureText(word).fontBoundingBoxDescent
			: 0
	}

	upscalePosition(pos: Position) {
		return {
			x: this.upscale(pos.x, this.playerResX, this.layers[0]?.canvas.width || 0),
			y: this.upscale(pos.y, this.playerResY, this.layers[0]?.canvas.height || 0)
		}
	}

	upscaleMargin(margin: { left: number; right: number; vertical: number }) {
		return {
			left: this.upscale(margin.left, this.playerResX, this.layers[0]?.canvas.width || 0),
			right: this.upscale(margin.right, this.playerResX, this.layers[0]?.canvas.width || 0),
			vertical: this.upscale(margin.vertical, this.playerResY, this.layers[0]?.canvas.height || 0)
		}
	}

	applyOverrideTag(tag: CompiledTag, font: FontDescriptor) {
		if (tag.b !== undefined) {
			font.bold = tag.b === 1
		}
		if (tag.i !== undefined) {
			font.italic = tag.i === 1
		}
		if (tag.u !== undefined) {
			font.underline = tag.u === 1
		}
		if (tag.s !== undefined) {
			font.strikeout = tag.s === 1
		}
		if (tag.fn !== undefined) {
			font.fontname = tag.fn
		}
		if (tag.fs !== undefined) {
			font.fontsize = this.upscale(tag.fs, this.playerResY, this.layers[0]?.canvas.height || 0)
		}
		if (tag.fscx !== undefined) {
			font.t.fscx = tag.fscx
		}
		if (tag.fscy !== undefined) {
			font.t.fscy = tag.fscy
		}
		if (tag.frz !== undefined) {
			font.t.frz = tag.frz
		}
		if (tag.frx !== undefined) {
			font.t.frx = tag.frx
		}
		if (tag.fry !== undefined) {
			font.t.fry = tag.fry
		}
		if (tag.fax !== undefined) {
			font.t.fax = tag.fax
		}
		if (tag.fay !== undefined) {
			font.t.fay = tag.fay
		}
		if (tag.fsp !== undefined) {
			font.t.fsp = this.upscale(tag.fsp, this.playerResX, this.layers[0]?.canvas.width || 0)
		}
		for (let i = 0; i < this.layers.length; i++) {
			const layer = this.layers[i] as Layer
			if (tag.c1 !== undefined) {
				layer.ctx.fillStyle = swapBBGGRR(tag.c1)
			}
			if (tag.a1 !== undefined) {
				layer.ctx.fillStyle = blendAlpha(layer.ctx.fillStyle as string, parseFloat(tag.a1))
			}
			if (tag.c3 !== undefined) {
				layer.ctx.strokeStyle = swapBBGGRR(tag.c3)
			}
			if (tag.a3 !== undefined) {
				layer.ctx.strokeStyle = blendAlpha(layer.ctx.strokeStyle as string, parseFloat(tag.a3))
			}
			if (tag.c4 !== undefined) {
				layer.ctx.shadowColor = swapBBGGRR(tag.c4)
			}
			if (tag.a4 !== undefined) {
				layer.ctx.shadowColor = blendAlpha(layer.ctx.shadowColor as string, parseFloat(tag.a4))
			}
			if (tag.xshad !== undefined) {
				layer.ctx.shadowOffsetX = this.upscale(
					tag.xshad,
					this.playerResX,
					this.layers[0]?.canvas.width || 0
				)
			}
			if (tag.yshad !== undefined) {
				layer.ctx.shadowOffsetY = this.upscale(
					tag.yshad,
					this.playerResY,
					this.layers[0]?.canvas.height || 0
				)
			}
			if (tag.xbord !== undefined) {
				layer.ctx.lineWidth = this.upscale(
					tag.xbord,
					this.playerResX,
					this.layers[0]?.canvas.width || 0
				)
				font.xbord = tag.xbord
			}
			if (tag.ybord !== undefined) {
				layer.ctx.lineWidth = this.upscale(
					tag.ybord,
					this.playerResY,
					this.layers[0]?.canvas.height || 0
				)
				font.ybord = tag.ybord
			}
			if (tag.blur !== undefined) {
				layer.ctx.shadowBlur = this.upscale(
					tag.blur,
					this.playerResY,
					this.layers[0]?.canvas.height || 0
				)
			}
			layer.ctx.font = this.fontDecriptorString(font)
		}
		// console.debug("font", font, this.fontDecriptorString(font), "->", this.ctx.font)
	}

	upscale(x: number, firstcomp: number, secondcomp: number) {
		return (ruleOfThree(firstcomp, secondcomp) * x) / 100
	}

	fontDecriptorString(font: FontDescriptor) {
		return `${font.bold ? 'bold ' : ''}${font.italic ? 'italic ' : ''}${font.fontsize.toFixed(
			3
		)}px "${font.fontname}"`
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
			c2, // secondary color
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
		} = style.tag

		const { PrimaryColour, OutlineColour, SecondaryColour, BorderStyle } = style.style

		const font: FontDescriptor = {
			fontsize: this.upscale(fs, this.playerResY, this.layers[0]?.canvas.height || 0),
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
				q: q
			},
			xbord: xbord,
			ybord: ybord,
			fe: fe,
			borderStyle: BorderStyle
		}
		this.textAlign = this.getAlignment(alignment)
		this.textBaseline = this.getBaseLine(alignment)
		this.fontSpacing = this.upscale(fsp, this.playerResX, this.layers[0]?.canvas.width || 0)
		for (let i = 0; i < this.layers.length; i++) {
			const layer = this.layers[i] as Layer
			layer.ctx.fillStyle = blendAlpha(font.colors.c1, parseFloat(a1))
			layer.ctx.strokeStyle = blendAlpha(font.colors.c3, parseFloat(a3))
			layer.ctx.font = this.fontDecriptorString(font)
			layer.ctx.shadowOffsetX = this.upscale(
				xshad,
				this.playerResX,
				this.layers[0]?.canvas.width || 0
			)
			layer.ctx.shadowOffsetY = this.upscale(
				yshad,
				this.playerResY,
				this.layers[0]?.canvas.height || 0
			)
			layer.ctx.shadowBlur = 0
			layer.ctx.shadowColor = blendAlpha(c4, parseFloat(a4))
			layer.ctx.lineWidth =
				this.upscale(xbord, this.playerResX, this.layers[0]?.canvas.width || 0) +
				this.upscale(ybord, this.playerResY, this.layers[0]?.canvas.height || 0)
			layer.ctx.lineCap = 'round'
			layer.ctx.lineJoin = 'round'
		}
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
