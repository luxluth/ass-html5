import { Dialogue } from 'ass-compiler'
import { DrawingStrategy } from './types'
import { Renderer } from './renderer'
import { Styles, Layer, Position, ASSAnimation } from './types'
import { hashString, makeLines, separateNewLine, splitTextOnTheNextCharacter } from './utils'


function drawText(renderer: Renderer, dialogue: Dialogue, styles: Styles): ASSAnimation.FrameRenderState {
	const slices = dialogue.slices	
	const layer = renderer.getLayer(dialogue.layer) as Layer

	let renderState: ASSAnimation.FrameRenderState = {
		playerResX: renderer.playerResX,
		playerResY: renderer.playerResY,
		time: 0,
		layer: dialogue.layer,
		canvas: {
			width: layer.canvas.width,
			height: layer.canvas.height,
		},
		words: []
	}

	slices.forEach((slice) => {
		const font = renderer.computeStyle(slice.style, styles, dialogue.alignment)
		const lines = makeLines(
			slice.fragments.map((fragment) => {
				// TODO: fragment.drawing
				return fragment.text
			})
		)

		// console.debug(lines)

		const lineHeights = lines.map(
			(line) =>
				layer.ctx.measureText(line).fontBoundingBoxAscent +
				layer.ctx.measureText(line).fontBoundingBoxDescent
		)

		const lineHeight = Math.max(...lineHeights)
		const totalHeight = lineHeight * lines.length

		const margin = renderer.upscaleMargin(dialogue.margin)

		let previousTextWidth = 0
		let currentLine = 0
		let y = 0
		let canvasHeight = layer.canvas.height
		let canvasWidth = layer.canvas.width

		switch (renderer.textBaseline) {
			case 'top':
				y = margin.vertical + (lines.length > 1 ? totalHeight / lines.length : lineHeight)
				break
			case 'middle':
				y = (canvasHeight - totalHeight) / 2 + lineHeight
				break
			case 'bottom':
				y = canvasHeight - margin.vertical - (lines.length > 1 ? totalHeight / lines.length : 0)
				break
			default:
				y = margin.vertical + lineHeight
				break
		}

		slice.fragments.forEach((fragment) => {
			renderer.applyOverrideTag(fragment.tag, font)
			const words = separateNewLine(splitTextOnTheNextCharacter(fragment.text))
			// console.debug(words)

			let lineWidth = layer.ctx.measureText(lines[currentLine] as string).width
			let x = 0
			switch (renderer.textAlign) {
				case 'left':
					x = margin.left + previousTextWidth
					break
				case 'center':
					x = (canvasWidth - lineWidth) / 2 + previousTextWidth
					break
				case 'right':
					x = canvasWidth - margin.right - lineWidth + previousTextWidth
					break
				default:
					x = margin.left + previousTextWidth
					break
			}

			let currentWordsWidth = 0

			words.forEach((word) => {
				let wordWidth = layer.ctx.measureText(word).width
				if (word === '\\N') {
					// console.debug('y', y)
					currentLine++
					y += lineHeight
					// console.debug('next-y', y)
					previousTextWidth = 0
					currentWordsWidth = 0
					lineWidth = layer.ctx.measureText(lines[currentLine] as string).width
					switch (renderer.textAlign) {
						case 'left':
							x = margin.left
							break
						case 'center':
							x = (canvasWidth - lineWidth) / 2
							break
						case 'right':
							x = canvasWidth - margin.right - lineWidth
							break
						default:
							x = margin.left
					}
				} else {
					renderState.words.push({
						type: 'word',
						text: word,
						font: Object.assign({}, font),
						style: slice.style,
						position: {
							x: x + currentWordsWidth,
							y: y
						}
					} as ASSAnimation.Word)
					// renderer.drawWord(word, x + currentWordsWidth, y, font, layer.ctx)
					currentWordsWidth += wordWidth
					previousTextWidth += wordWidth
				}
			})
		})
	})
	return renderState
}


function drawTextAtPosition(pos: Position, renderer: Renderer, dialogue: Dialogue, styles: Styles): ASSAnimation.FrameRenderState {
	pos = renderer.upscalePosition(pos)
	const slices = dialogue.slices
	const layer = renderer.getLayer(dialogue.layer) as Layer

	let renderState: ASSAnimation.FrameRenderState = {
		playerResX: renderer.playerResX,
		playerResY: renderer.playerResY,
		time: 0,
		layer: dialogue.layer,
		canvas: {
			width: layer.canvas.width,
			height: layer.canvas.height,
		},
		words: []
	}

	slices.forEach((slice) => {
		let font = renderer.computeStyle(slice.style, styles, dialogue.alignment)
		const lines = makeLines(
			slice.fragments.map((fragment) => {
				return fragment.text
			})
		)

		const lineHeights = lines.map(
			(line) =>
				layer.ctx.measureText(line).actualBoundingBoxAscent +
				layer.ctx.measureText(line).actualBoundingBoxDescent
		)
		// console.log("lineHeights", lineHeights, font.fontsize)
		let previousTextWidth = 0
		let currentLine = 0
		let lineHeight = Math.max(...lineHeights)
		let totalHeight = lineHeights.reduce((a, b) => a + b, 0)
		let y = pos.y

		switch (renderer.textBaseline) {
			case 'top':
				y += lineHeight / lines.length
				break
			case 'middle':
				y += totalHeight / 2
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
			renderer.applyOverrideTag(fragment.tag, font)
			let words = separateNewLine(splitTextOnTheNextCharacter(fragment.text))
			words = words.filter((word) => word !== '')
			// console.debug("words", words)

			let lineWidth = layer.ctx.measureText(lines[currentLine] as string).width
			switch (renderer.textAlign) {
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
			// let plusH = 0

			words.forEach((word) => {
				if (word === '\\N') {
					currentLine++
					y += font.fontsize // + plusH
					previousTextWidth = 0
					currentWordsWidth = 0
					lineWidth = layer.ctx.measureText(lines[currentLine] as string).width
					switch (renderer.textAlign) {
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
					let wordWidth = layer.ctx.measureText(word).width
					// console.debug("word", `'${word}'`, wordWidth)
					renderState.words.push({
						type: 'word',
						text: word,
						font: Object.assign({}, font),
						style: slice.style,
						position: {
							x: x + currentWordsWidth,
							y: y
						}
					} as ASSAnimation.Word)
					// plusH = renderer.drawWord(word, x + currentWordsWidth, y, font, layer.ctx)
					currentWordsWidth += wordWidth
					previousTextWidth += wordWidth
				}
			})
		})
	})

	return renderState
}


export class SimpleDrawing implements DrawingStrategy {
	renderer: Renderer
	dialogue: Dialogue
	styles: Styles

	constructor(renderer: Renderer, dialogue: Dialogue, styles: Styles) {
		this.renderer = renderer
		this.dialogue = dialogue
		this.styles = styles
	}

	draw(): void {
		const { layer } = this.dialogue
		const renderState = drawText(this.renderer, this.dialogue, this.styles)
		console.debug('renderState', renderState)
		this.renderer.drawFrame(renderState, layer)
	}
}

export class SpecificPositionDrawing implements DrawingStrategy {
	renderer: Renderer
	dialogue: Dialogue
	styles: Styles
	pos: Position

	constructor(renderer: Renderer, dialogue: Dialogue, styles: Styles, pos: Position) {
		this.renderer = renderer
		this.dialogue = dialogue
		this.styles = styles
		this.pos = pos
	}
	draw(): void {
		const { layer } = this.dialogue
		const renderState = drawTextAtPosition(this.pos, this.renderer, this.dialogue, this.styles)
		console.debug('renderState', renderState)
		this.renderer.drawFrame(renderState, layer)
	}
}


export let animationBundles: ASSAnimation.Bundle[] = []

export class AnimateDrawing implements DrawingStrategy {
	renderer: Renderer
	dialogue: Dialogue
	styles: Styles
	animations: ASSAnimation.Animation[]

	constructor(
		renderer: Renderer,
		dialogue: Dialogue,
		styles: Styles,
		animations: ASSAnimation.Animation[]
	) {
		this.renderer = renderer
		this.dialogue = dialogue
		this.styles = styles
		this.animations = animations
	}

	// bakeFrameRenderState(): ASSAnimation.FrameRenderState {}

	// applyfade(pureState: ASSAnimation.FrameRenderState): ASSAnimation.FrameRenderState {}

	// applymove(pureState: ASSAnimation.FrameRenderState): ASSAnimation.FrameRenderState {}

	// applyrotate(pureState: ASSAnimation.FrameRenderState): ASSAnimation.FrameRenderState {}
	
    // buildBundle(): ASSAnimation.Bundle {
    //     let animationBundle: ASSAnimation.Bundle = {
	// 		start: this.dialogue.start,
	// 		end: this.dialogue.end,
	// 		animations: this.animations,
	// 		hash: hashString(JSON.stringify(this.dialogue)),
	// 		frames: [],
	// 		active: false,
	// 	}

	// 	const { layer } = this.dialogue

	// 	animationBundle.animations.forEach((animation) => {
	// 	})

    // }

	getAnimationBundle(): ASSAnimation.Bundle | null {
		let hash = hashString(JSON.stringify(this.dialogue))
		let animationBundle = animationBundles.find((bundle) => bundle.hash === hash)
		if (typeof animationBundle === 'undefined') {
			return null
		} else {
			return animationBundle
		}
	}

    draw(): void {
		console.warn('AnimateDrawing not implemented.', this.animations)
		const start = this.dialogue.start
		const end = this.dialogue.end
		const duration = end - start
		const animationBundle = this.getAnimationBundle()
	}
}
