import { Dialogue } from 'ass-compiler'
import { DrawingStrategy } from './types'
import { Renderer } from './renderer'
import { Styles, Layer, Position, ASSAnimation } from './types'
import { makeLines, separateNewLine, splitTextOnTheNextCharacter } from './utils'

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
		const slices = this.dialogue.slices
		// if (typeof pos !== 'undefined') {
		//     this.drawTextAtPosition(dialogue, styles, pos)
		//     return
		// } else if (typeof move !== 'undefined') {
		//     let pos = {
		//         x: move.x1,
		//         y: move.y1
		//     }
		//     this.drawTextAtPosition(dialogue, styles, pos)
		//     return
		// }

		const layer = this.renderer.getLayer(this.dialogue.layer) as Layer
		slices.forEach((slice) => {
			const font = this.renderer.computeStyle(slice.style, this.styles, this.dialogue.alignment)
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

			const margin = this.renderer.upscaleMargin(this.dialogue.margin)

			let previousTextWidth = 0
			let currentLine = 0
			let y = 0
			let canvasHeight = layer.canvas.height
			let canvasWidth = layer.canvas.width

			switch (this.renderer.textBaseline) {
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
				this.renderer.applyOverrideTag(fragment.tag, font)
				const words = separateNewLine(splitTextOnTheNextCharacter(fragment.text))
				// console.debug(words)

				let lineWidth = layer.ctx.measureText(lines[currentLine] as string).width
				let x = 0
				switch (this.renderer.textAlign) {
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
						switch (this.renderer.textAlign) {
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
						this.renderer.drawWord(word, x + currentWordsWidth, y, font, layer.ctx)
						currentWordsWidth += wordWidth
						previousTextWidth += wordWidth
					}
				})
			})
		})
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
		this.pos = this.renderer.upscalePosition(this.pos)
		const slices = this.dialogue.slices
		const layer = this.renderer.getLayer(this.dialogue.layer) as Layer
		slices.forEach((slice) => {
			let font = this.renderer.computeStyle(slice.style, this.styles, this.dialogue.alignment)
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
			let y = this.pos.y

			switch (this.renderer.textBaseline) {
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

			if (font.borderStyle === 3) {
				let savedy = y
				this.renderer.drawTextBackground(lines, currentLine, this.pos, font, y, slice.fragments)
				currentLine = 0
				y = savedy
			}

			slice.fragments.forEach((fragment) => {
				// console.debug("frag", fragment)
				let x = this.pos.x
				this.renderer.applyOverrideTag(fragment.tag, font)
				let words = separateNewLine(splitTextOnTheNextCharacter(fragment.text))
				words = words.filter((word) => word !== '')
				// console.debug("words", words)

				let lineWidth = layer.ctx.measureText(lines[currentLine] as string).width
				switch (this.renderer.textAlign) {
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
						y += font.fontsize + plusH
						previousTextWidth = 0
						currentWordsWidth = 0
						lineWidth = layer.ctx.measureText(lines[currentLine] as string).width
						switch (this.renderer.textAlign) {
							case 'left':
								x = this.pos.x
								break
							case 'center':
								x = this.pos.x - lineWidth / 2
								break
							case 'right':
								x = this.pos.x - lineWidth
								break
							default:
								x = this.pos.x
						}
					} else {
						let wordWidth = layer.ctx.measureText(word).width
						// console.debug("word", `'${word}'`, wordWidth)
						plusH = this.renderer.drawWord(word, x + currentWordsWidth, y, font, layer.ctx)
						currentWordsWidth += wordWidth
						previousTextWidth += wordWidth
					}
				})
			})
		})
	}
}

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
	draw(): void {
		console.warn('AnimateDrawing not implemented.', this.animations)
	}
}
