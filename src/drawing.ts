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
						font: JSON.parse(JSON.stringify(font)),
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
						font: JSON.parse(JSON.stringify(font)),
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

	/**
	 * ## Fade
	 * 
	 * Apply a fade-in and fade-out effect to the dialogue
	 * @param values - [fadein, fadeout]
	 * @param pureState - The state of the frame before applying the animation
	 * @param duration - The duration of the dialogue in seconds
	 * @param fps - The framerate of the video
	 */
	applyfad(values: ASSAnimation.FadValues, pureState: ASSAnimation.FrameRenderState[], duration: number, fps: number = 60) {
		// Produce a fade-in and fade-out effect
		// example: \fad(1200,250)
		// Fade in the line in the first 1.2 seconds it is to be displayed, 
		// and fade it out for the last one quarter second it is displayed.
		const [fadein, fadeout] = values
		const fadeInFrames = fadein / 1000 * fps
		const fadeOutFrames = fadeout / 1000 * fps
		const totalFrames = duration * fps
		const fadeInStep = 1 / fadeInFrames
		const fadeOutStep = 1 / fadeOutFrames

		pureState.forEach((frame, index) => {
			if (index < fadeInFrames) {
				frame.words.forEach((word) => {
					const alpha = fadeInStep * index
					word.font.colors.a1 = alpha
					word.font.colors.a2 = alpha
					word.font.colors.a3 = alpha
					word.font.colors.a4 = alpha
				})
			} else if (index > totalFrames - fadeOutFrames) {
				frame.words.forEach((word) => {
					const alpha = fadeOutStep * (totalFrames - index)
					word.font.colors.a1 = alpha
					word.font.colors.a2 = alpha
					word.font.colors.a3 = alpha
					word.font.colors.a4 = alpha
				})
			} else {
				frame.words.forEach((word) => {
					word.font.colors.a1 = 1
					word.font.colors.a2 = 1
					word.font.colors.a3 = 1
					word.font.colors.a4 = 1
				})
			}
		})
	}
	
	/**
	 * ## Fade (complex)
	 * 
	 * Perform a five-part fade using three alpha values a1, a2 and a3 and four times t1, t2, t3 and t4.
	 * The alpha values are given in decimal and are between 0 and 255, with 0 being fully visible and 255 being invisible. 
	 * The time values are given in milliseconds after the start of the line. All seven parameters are required.
	 * 
	 * @param values - [a1, a2, a3, t1, t2, t3, t4]
	 * @param pureState - The state of the frame before applying the animation
	 * @param duration - The duration of the dialogue in seconds
	 * @param fps - The framerate of the video
	 */
	applyfade(values: ASSAnimation.FadeValues, pureState: ASSAnimation.FrameRenderState[], duration: number, fps: number=60) {
		// Before t1, the line has alpha a1.
		// Between t1 and t2 the line fades from alpha a1 to alpha a2.
		// Between t2 and t3 the line has alpha a2 constantly.
		// Between t3 and t4 the line fades from alpha a2 to alpha a3.
		// After t4 the line has alpha a3.
		// example: \fade(255,32,224,0,500,2000,2200)
		// Starts invisible, fades to almost totally opaque, then fades to almost totally invisible. 
		// First fade starts when the line starts and lasts 500 milliseconds. 
		// Second fade starts 1500 milliseconds later, and lasts 200 milliseconds.

		const [a1, a2, a3, t1, t2, t3, t4] = values
		const totalFrames = duration * fps
		const fadeInFrames = t2 / 1000 * fps
		const fadeOutFrames = t4 / 1000 * fps
		const fadeInStep = (a2 - a1) / fadeInFrames
		const fadeOutStep = (a3 - a2) / fadeOutFrames

		pureState.forEach((frame, index) => {
			if (index < t1 / 1000 * fps) {
				frame.words.forEach((word) => {
					word.font.colors.a1 = a1 / 255
					word.font.colors.a2 = a1 / 255
					word.font.colors.a3 = a1 / 255
					word.font.colors.a4 = a1 / 255
				})
			} else if (index < t2 / 1000 * fps) {
				frame.words.forEach((word) => {
					const alpha = a1 / 255 + fadeInStep * (index - t1 / 1000 * fps)
					word.font.colors.a1 = alpha
					word.font.colors.a2 = alpha
					word.font.colors.a3 = alpha
					word.font.colors.a4 = alpha
				})
			} else if (index < t3 / 1000 * fps) {
				frame.words.forEach((word) => {
					word.font.colors.a1 = a2 / 255
					word.font.colors.a2 = a2 / 255
					word.font.colors.a3 = a2 / 255
					word.font.colors.a4 = a2 / 255
				})
			} else if (index < t4 / 1000 * fps) {
				frame.words.forEach((word) => {
					const alpha = a2 / 255 + fadeOutStep * (index - t3 / 1000 * fps)
					word.font.colors.a1 = alpha
					word.font.colors.a2 = alpha
					word.font.colors.a3 = alpha
					word.font.colors.a4 = alpha
				})
			} else {
				frame.words.forEach((word) => {
					word.font.colors.a1 = a3 / 255
					word.font.colors.a2 = a3 / 255
					word.font.colors.a3 = a3 / 255
					word.font.colors.a4 = a3 / 255
				})
			}
		})
	}

	/**
	 * ## Move
	 * 
	 * Move the dialogue from one position to another
	 * The two versions of `\move` differ in that one makes the movement occur over the 
	 * entire duration of the subtitle, while on the other you specify the time 
	 * over which the movement occurs.
	 * 
	 * @param values - [x1, y1, x2, y2] or [x1, y1, x2, y2, t1, t2]
	 * @param pureState - The state of the frame before applying the animation
	 * @param duration - The duration of the dialogue in seconds
	 * @param fps - The framerate of the video
	 */
	applymove(values: ASSAnimation.MoveValues, pureState: ASSAnimation.FrameRenderState[], duration: number, fps: number = 60) {
		switch (values.length) {
			case 4:
				// Example: \move(100,150,300,350)
				// When the line appears on screen, the subtitle is at (100,150). 
				// While the subtitle is displayed, it moves at constant speed such 
				// that it will arrive at point (300,350) at the same time it disappears.
				const [x1, y1, x2, y2] = values
				pureState.forEach((frame, index) => {
					const x = x1 + (x2 - x1) / duration * index / fps
					const y = y1 + (y2 - y1) / duration * index / fps
					frame.words.forEach((word) => {
						word.position.x = x
						word.position.y = y
					})
				})
				break
			case 6:
				// Example: \move(100,150,300,350,500,1500)
				// The line appears at (100,150). 
				// After the line has been displayed for half a second (500 milliseconds) 
				// it begins moving towards (300,350) such that it will arrive at the point 
				// a second and a half (1500 milliseconds) after the line first appeared on screen.
				const [Px1, Py1, Px2, Py2, Pt1, Pt2] = values
				const moveStartFrame = Pt1 / 1000 * fps
				const moveEndFrame = Pt2 / 1000 * fps
				const moveDuration = Pt2 - Pt1
				const moveStepX = (Px2 - Px1) / moveDuration
				const moveStepY = (Py2 - Py1) / moveDuration
				pureState.forEach((frame, index) => {
					if (index < moveStartFrame) {
						frame.words.forEach((word) => {
							word.position.x = Px1
							word.position.y = Py1
						})
					} else if (index < moveEndFrame) {
						const x = Px1 + moveStepX * (index - moveStartFrame)
						const y = Py1 + moveStepY * (index - moveStartFrame)
						frame.words.forEach((word) => {
							word.position.x = x
							word.position.y = y
						})
					} else {
						frame.words.forEach((word) => {
							word.position.x = Px2
							word.position.y = Py2
						})
					}
				})
				break
			default:
				console.warn('Invalid move animation', values)
				break
		}
	}

	/**
	 * ## Rotation origin
	 * 
	 * Set the origin point used for rotation. 
	 * This affects all rotations of the line. 
	 * The X and Y coordinates are given in integer script resolution pixels.
	 * 
	 * @param values - [x, y]
	 * @param pureState - The state of the frame before applying the animation
	 * @param duration - The duration of the dialogue in seconds
	 * @param fps - The framerate of the video
	 * 
	 * > **Note:** This animation is not implemented yet.
	 */
	applyrotate(values: ASSAnimation.OrgValues, pureState: ASSAnimation.FrameRenderState[], duration: number, fps: number = 60) {
		console.warn('Rotation origin animation not implemented.', values)
	}
	
    buildBundle(): ASSAnimation.Bundle {
        let animationBundle: ASSAnimation.Bundle = {
			start: this.dialogue.start,
			end: this.dialogue.end,
			animations: this.animations,
			hash: hashString(JSON.stringify(this.dialogue)),
			frames: [],
			active: false,
			layer: this.dialogue.layer,
		}

		const { move, pos } = this.dialogue

		let pureState: ASSAnimation.FrameRenderState

		if (pos !== undefined) {
			pureState = drawTextAtPosition(pos, this.renderer, this.dialogue, this.styles)
		} else if (move !== undefined) {
			pureState = drawTextAtPosition({
				x: move.x1,
				y: move.y1,
			}, this.renderer, this.dialogue, this.styles)
		} else {
			pureState = drawText(this.renderer, this.dialogue, this.styles)
		}

		const fps = 60
		const duration = this.dialogue.end - this.dialogue.start
		const frames = duration * fps
		const frameDuration = 1000 / fps

		for (let i = 0; i < frames; i++) {
			let frameRenderState = JSON.parse(JSON.stringify(pureState))
			frameRenderState.time = i * frameDuration
			animationBundle.frames.push(frameRenderState)
		}

		animationBundle.animations.forEach((animation) => {
			switch (animation.name) {
				case 'fad':
					this.applyfad(animation.values, animationBundle.frames, duration, fps)
					break
				case 'fade':
					this.applyfade(animation.values, animationBundle.frames, duration, fps)
					break
				case 'move':
					this.applymove(animation.values, animationBundle.frames, duration, fps)
					break
				case 'org':
					this.applyrotate(animation.values, animationBundle.frames, duration, fps)
					break
				default:
					console.warn('Unknown animation', animation)
					break
			}
		})
		return animationBundle
    }

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
		// console.warn('AnimateDrawing not implemented.', this.animations)
		const start = this.dialogue.start
		const end = this.dialogue.end
		const duration = end - start
		const fps = 60
		let animationBundle = this.getAnimationBundle()
		if (animationBundle === null) {
			animationBundle = this.buildBundle()
			animationBundles.push(animationBundle)
		}

		const renderState = animationBundle.frames.find((frame) => frame.time === 0)
		if (typeof renderState === 'undefined') {
			console.warn('No render state found for frame 0')
			return
		}

		console.debug(animationBundle)

		// this.animate(animationBundle, duration, fps)
	}

	animate(animationBundle: ASSAnimation.Bundle, duration: number, fps: number) {
		const { layer } = this.dialogue
		const frames = duration * fps
		const frameDuration = 1000 / fps

		const bundleRequestFrameId = window.requestAnimationFrame(() => {
			animationBundle.active = true
			animationBundle.frames.forEach((frame, index) => {
				window.setTimeout(() => {
					// this.renderer.clearLayer(layer)
					this.renderer.drawFrame(frame, layer)
				}, index * frameDuration)
			})
			window.setTimeout(() => {
				animationBundle.active = false
			}, frames * frameDuration)
		})
		animationBundle.requestFrameId = bundleRequestFrameId
	}

	pause(): void {
		for (let bundle of animationBundles) {
			if (bundle.active) {
				if (bundle.requestFrameId !== undefined) {
					window.cancelAnimationFrame(bundle.requestFrameId)
				}
				bundle.active = false
			}
		}
	}
}
