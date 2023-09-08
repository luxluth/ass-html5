import type { CompiledASS, CompiledASSStyle, Dialogue, DialogueFragment } from 'ass-compiler'
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

import { Drawing } from './drawing'

export class Renderer {
	compiledASS: CompiledASS
	video: HTMLVideoElement
	playerResX: number
	playerResY: number
	canvas: HTMLCanvasElement
	ctx: CanvasRenderingContext2D

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

	getOverrideStyle(time: number, dialogues: Dialogue[]) {
		return dialogues.filter((dialogue) => {
			return dialogue.start <= time && dialogue.end >= time
		})
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

	showText(overrides: Override[], styles: Styles) {
		overrides.forEach((override) => {
			const { dialogue } = override
			this.drawText(dialogue, styles)
		})
	}

	drawText(dialogue: Dialogue, styles: Styles) {
		new Drawing(this, dialogue, styles).draw()
	}

	upscale(x: number, firstcomp: number, secondcomp: number) {
		return (ruleOfThree(firstcomp, secondcomp) * x) / 100
	}

	upscalePosition(pos: Position) {
		return {
			x: this.upscale(pos.x, this.playerResX, this.canvas.width),
			y: this.upscale(pos.y, this.playerResY, this.canvas.height)
		}
	}

	upscaleMargin(margin: { left: number; right: number; vertical: number }) {
		return {
			left: this.upscale(margin.left, this.playerResX, this.canvas.width),
			right: this.upscale(margin.right, this.playerResX, this.canvas.width),
			vertical: this.upscale(margin.vertical, this.playerResY, this.canvas.height)
		}
	}

	computeStyle(name: string, styles: { [styleName: string]: CompiledASSStyle }) {
		const style = styles[name] as CompiledASSStyle
		if (style === undefined) {
			console.warn(`[ass-html5:Renderer] Style ${name} not found`)
		}
		const {
			fn, // font name
			fs, // font size
			a1, // primary alpha
			a2, // secondary alpha
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
			q, // wrap style
		} = style.tag

		const { PrimaryColour, OutlineColour, SecondaryColour, BorderStyle } = style.style

		const font: FontDescriptor = {
			fontsize: this.upscale(fs, this.playerResY, this.canvas.height),
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
				a4: parseFloat(a4),
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
			xshad: xshad,
			yshad: yshad,
			fsp: fsp,
			fe: fe,
			borderStyle: BorderStyle
		}

		// this.textAlign = this.getAlignment(alignment)
		// this.textBaseline = this.getBaseLine(alignment)
		// this.fontSpacing = this.upscale(fsp, this.playerResX, this.canvas.width)
		// this.ctx.fillStyle = blendAlpha(font.colors.c1, parseFloat(a1))
		// this.ctx.strokeStyle = blendAlpha(font.colors.c3, parseFloat(a3))
		// this.ctx.font = this.fontDecriptorString(font)
		// this.ctx.shadowOffsetX = this.upscale(xshad, this.playerResX, this.canvas.width)
		// this.ctx.shadowOffsetY = this.upscale(yshad, this.playerResY, this.canvas.height)
		// this.ctx.shadowBlur = 0
		// this.ctx.shadowColor = blendAlpha(c4, parseFloat(a4))
		// this.ctx.lineWidth = this.upscale(xbord, this.playerResX, this.canvas.width) + this.upscale(ybord, this.playerResY, this.canvas.height)
		// this.ctx.lineCap = 'round'
		// this.ctx.lineJoin = 'round'
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
