import type { CompiledASS, CompiledASSStyle, Dialogue } from 'ass-compiler'
import { Override } from './types'
export class Renderer {
	compiledASS: CompiledASS
	canvas: HTMLCanvasElement
	ctx: CanvasRenderingContext2D
	video: HTMLVideoElement
	playerResX: number
	playerResY: number

	textAlign: CanvasTextAlign = 'start'
	textBaseline: CanvasTextBaseline = 'alphabetic'

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
		let data = [
		    {compiledASS : this.compiledASS},
		    {canvas : this.canvas},
		    {ctx : this.ctx}
		]
		console.debug(data)
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
				style: styles[dialogue.style] as CompiledASSStyle,
			}
		}) as Override[]
		console.debug(overrides)
	}

	getOverrideStyle(time: number, dialogues: Dialogue[]) {
		return dialogues.filter((dialogue) => {
			return dialogue.start <= time && dialogue.end >= time
		})
	}
	
	showText(overrides: Override[]) {
		overrides.forEach((override) => {
			const { dialogue, style } = override
			const { margin, alignment, layer, slices, effect, pos, org, fade, move, clip } = dialogue
			const { fn, fs, c1, a1, c2, a2, c3, a3, c4, a4, b, i, u, s, fscx, 
					fscy, fsp, frz, xbord, ybord, xshad, yshad, fe, q } = style.tag
		})
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
