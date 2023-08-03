import type { ParsedASS, ParsedASSEventText, ParsedASSEventTextParsed } from 'ass-compiler'
import { SingleStyle, FontDescriptor, Tag, ASSAnimation, Shift, Tweaks, TimeRange } from './types'
import { ruleOfThree, convertAegisubToRGBA, hashString, makeLines, splitTextOnTheNextCharacter } from './utils'
import { Animate } from './animate'

export class Renderer {
	parsedAss: ParsedASS
	canvas: HTMLCanvasElement
	ctx: CanvasRenderingContext2D
	video: HTMLVideoElement
	animator: Animate
	playerResX: number
	playerResY: number
	styles: SingleStyle[]

	textAlign: CanvasTextAlign = 'start'
	textBaseline: CanvasTextBaseline = 'alphabetic'
	tweaksAppliedResult = {
		positionChanged: false,
		position: [0, 0],
		animation: [] as ASSAnimation.Animation[],	
	}

	previousTextWidth = 0
	previousTextPos = { x: 0, y: 0 }
	startBaseline = 0
	timeRange = {
		start: 0,
		end: 0
	} as TimeRange
	currentHash  = 0

	constructor(parsedASS: ParsedASS, canvas: HTMLCanvasElement, video: HTMLVideoElement) {
		this.parsedAss = parsedASS
		this.playerResX = parseFloat(this.parsedAss.info.PlayResX)
		this.playerResY = parseFloat(this.parsedAss.info.PlayResY)
		this.styles = parsedASS.styles.style as SingleStyle[]
		this.canvas = canvas
		this.video = video
		this.ctx = canvas.getContext('2d') as CanvasRenderingContext2D
		if (this.ctx === null) {
			throw new Error('Unable to initilize the Canvas 2D context')
		}
		this.animator = new Animate(this)
		// let data = [
		//     {parsedAss : this.parsedAss},
		//     {canvas : this.canvas},
		//     {ctx : this.ctx}
		// ]
		// console.debug(data)
	}

	render() {
		this.video.addEventListener('timeupdate', () => {
			this.diplay(this.video.currentTime)
		})

		this.video.addEventListener('pause', () => {
			this.animator.removeAllAnimations()
		})
		this.video.addEventListener('seeked', () => {
			this.animator.removeAllAnimations()
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
		const overlappingDialoguesEvents = this.parsedAss.events.dialogue.filter(
			(event) => event.Start <= time && event.End >= time
		)

		// Clear the canvas
		this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
		overlappingDialoguesEvents.forEach((event) => {
			// console.debug(event)
			const { Style, Text, MarginL, MarginR, MarginV, Start, End } = event
			this.timeRange = { start: Start, end: End }
			// this.showText(Text, style, { marginL: MarginL, marginR: MarginR, marginV: MarginV })
		})
	}
	
	showText() {
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
