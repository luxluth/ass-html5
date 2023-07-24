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
			const style = this.getStyle(Style)
			if (style === undefined) {
				return
			}
			this.timeRange = { start: Start, end: End }
			this.showText(Text, style, { marginL: MarginL, marginR: MarginR, marginV: MarginV })
		})
	}
	
	showText(Text: ParsedASSEventText, style: SingleStyle, shift: Shift) {
		this.ctx.globalAlpha = 1
		this.currentHash = hashString(JSON.stringify(Text))
		// console.debug("hash", JSON.stringify(this.currentHash))
		let fontDescriptor = this.getFontDescriptor(style) // FontDescriptor
		let c1 = convertAegisubToRGBA(style.PrimaryColour) // primary color
		// let c2 = convertAegisubToRGBA(style.SecondaryColour, tags) // secondary color
		let c3 = convertAegisubToRGBA(style.OutlineColour) // outline color
		let c4 = convertAegisubToRGBA(style.BackColour) // shadow color
		let marginL =
			(ruleOfThree(this.playerResX, this.canvas.width) * parseFloat(style.MarginL)) / 100 +
			(ruleOfThree(this.playerResX, this.canvas.width) * shift.marginL) / 100
		let marginV =
			(ruleOfThree(this.playerResY, this.canvas.height) * parseFloat(style.MarginV)) / 100 +
			(ruleOfThree(this.playerResY, this.canvas.height) * shift.marginV) / 100
		let marginR =
			(ruleOfThree(this.playerResX, this.canvas.width) * parseFloat(style.MarginR)) / 100 +
			(ruleOfThree(this.playerResX, this.canvas.width) * shift.marginR) / 100
		// console.debug(marginL, marginV, marginR)

		this.ctx.font = ` ${fontDescriptor.bold ? 'bold' : ''} ${
			fontDescriptor.italic ? 'italic' : ''
		}  ${fontDescriptor.fontsize}px ${fontDescriptor.fontname}`
		// console.debug(this.ctx.font)
		this.textAlign = this.getAlignment(parseInt(style.Alignment)) as CanvasTextAlign
		this.textBaseline = this.getBaseLine(parseInt(style.Alignment)) as CanvasTextBaseline
		this.ctx.fillStyle = c1
		this.ctx.strokeStyle = c3
		this.ctx.lineWidth =
			((ruleOfThree(this.playerResX, this.canvas.width) * parseFloat(style.Outline)) / 100) * 2
		// console.debug(this.ctx.lineWidth, style.Outline)
		this.ctx.lineJoin = 'round'
		this.ctx.lineCap = 'round'
		this.ctx.miterLimit = 2
		this.ctx.shadowColor = c4
		this.ctx.shadowBlur =
			(ruleOfThree(this.playerResX, this.canvas.width) * parseFloat(style.Shadow)) / 100
		this.ctx.shadowOffsetX =
			(ruleOfThree(this.playerResX, this.canvas.width) * parseFloat(style.Shadow)) / 100
		this.ctx.shadowOffsetY =
			(ruleOfThree(this.playerResY, this.canvas.height) * parseFloat(style.Shadow)) / 100

		this.drawTextV2(Text.parsed, marginL, marginV, marginR, fontDescriptor, true)
	}

	flatTags(tags: Tag[]) {
		let flatTags: Tag = {}
		tags.forEach((tag) => {
			flatTags = { ...flatTags, ...tag }
		})
		return flatTags
	}

	teawksDrawSettings(
		tags: Tag[],
		fontDescriptor: FontDescriptor,
		tagsParsed: boolean = false,
		tagsParsedAll?: Tag,
		posShift?: [number, number]
	) {
		const tweaked = tags.length > 0 ? true : false
		// put all the tags in the same object
		let tagsCombined: Tag = {}
		if (tagsParsed) {
			tagsCombined = tagsParsedAll as Tag
		} else {
			tagsCombined = this.flatTags(tags)
		}
		// console.debug("tagsCombined", tagsCombined)
		const primaryColor =
			typeof tagsCombined.c1 !== 'undefined'
				? convertAegisubToRGBA('00' + tagsCombined.c1, tagsCombined)
				: undefined
		const secondaryColor =
			typeof tagsCombined.c2 !== 'undefined'
				? convertAegisubToRGBA('00' + tagsCombined.c2, tagsCombined)
				: undefined
		const outlineColor =
			typeof tagsCombined.c3 !== 'undefined'
				? convertAegisubToRGBA('00' + tagsCombined.c3, tagsCombined)
				: undefined
		const shadowColor =
			typeof tagsCombined.c4 !== 'undefined'
				? convertAegisubToRGBA('00' + tagsCombined.c4, tagsCombined)
				: undefined
		let bold = false
		if (typeof tagsCombined.b !== 'undefined') {
			if (tagsCombined.b === 1) {
				bold = true
			} else if (tagsCombined.b === 0) {
				bold = false
			}
		}
		let italic = false
		if (typeof tagsCombined.i !== 'undefined') {
			if (tagsCombined.i === 1) {
				italic = true
			} else if (tagsCombined.i === 0) {
				italic = false
			}
		}
		let underline = false
		if (typeof tagsCombined.u !== 'undefined') {
			if (tagsCombined.u === 1) {
				underline = true
			} else if (tagsCombined.u === 0) {
				underline = false
			}
		}
		let strikeOut = false
		if (typeof tagsCombined.s !== 'undefined') {
			if (tagsCombined.s === 1) {
				strikeOut = true
			} else if (tagsCombined.s === 0) {
				strikeOut = false
			}
		}
		const scaleX = typeof tagsCombined.xbord !== 'undefined' ? tagsCombined.xbord : undefined
		const scaleY = typeof tagsCombined.ybord !== 'undefined' ? tagsCombined.ybord : undefined
		const spacing = typeof tagsCombined.xshad !== 'undefined' ? tagsCombined.xshad : undefined
		const angle = typeof tagsCombined.fax !== 'undefined' ? tagsCombined.fax : undefined
		const borderStyle = typeof tagsCombined.bord !== 'undefined' ? tagsCombined.bord : undefined
		const outline = typeof tagsCombined.bord !== 'undefined' ? tagsCombined.bord : undefined
		const shadow = typeof tagsCombined.shad !== 'undefined' ? tagsCombined.shad : undefined
		// alignment is an or a
		const alignment =
			typeof tagsCombined.an !== 'undefined'
				? tagsCombined.an
				: typeof tagsCombined.a !== 'undefined'
				? tagsCombined.a
				: undefined
		const position =
			typeof tagsCombined.pos !== 'undefined'
				? ([
						(ruleOfThree(this.playerResX, this.canvas.width) * tagsCombined.pos[0]) / 100 +
							(posShift ? posShift[0] : 0),
						(ruleOfThree(this.playerResY, this.canvas.height) * tagsCombined.pos[1]) / 100 +
							(posShift ? posShift[1] : 0)
				  ] as [number, number])
				: undefined

		const fontsize = tagsCombined.fs ? tagsCombined.fs : undefined
		const fontname = tagsCombined.fn ? tagsCombined.fn : undefined

		// Animation
		let animations: ASSAnimation.Animation[] = []
		const MoveAnimation = typeof tagsCombined.move !== 'undefined' ? this.upsacaleMove(tagsCombined.move) : undefined
		const simpleFadeAnimation =
			typeof tagsCombined.fad !== 'undefined' ? tagsCombined.fad : undefined
		const complexFadeAnimation =
			typeof tagsCombined.fade !== 'undefined' ? tagsCombined.fade : undefined
		const orgAnimation = typeof tagsCombined.org !== 'undefined' ? tagsCombined.org : undefined

		const fadeAnimation =
			typeof simpleFadeAnimation !== 'undefined'
				? ({
						name: 'fad',
						values: simpleFadeAnimation
				  } as ASSAnimation.Fade)
				: typeof complexFadeAnimation !== 'undefined'
				? ({
						name: 'fade',
						values: complexFadeAnimation
				  } as ASSAnimation.Fade)
				: undefined
		const moveAnimation =
			typeof MoveAnimation !== 'undefined'
				? ({
						name: 'move',
						values: MoveAnimation
				  } as ASSAnimation.Move)
				: undefined
		const orgAnimationParsed =
			typeof orgAnimation !== 'undefined'
				? ({
						name: 'org',
						values: orgAnimation
				  } as ASSAnimation.Org)
				: undefined

		if (typeof fadeAnimation !== 'undefined') {
			animations = [...animations, fadeAnimation]
		}
		if (typeof moveAnimation !== 'undefined') {
			animations = [...animations, moveAnimation]
		}
		if (typeof orgAnimationParsed !== 'undefined') {
			animations = [...animations, orgAnimationParsed]
		}

		if (typeof fontsize !== 'undefined') {
			fontDescriptor.fontsize =
				(ruleOfThree(this.playerResY, this.canvas.height) * parseFloat(fontsize)) / 100
		}
		if (typeof fontname !== 'undefined') {
			fontDescriptor.fontname = fontname
		}
		if (typeof bold !== 'undefined') {
			fontDescriptor.bold = bold
		}
		if (typeof italic !== 'undefined') {
			fontDescriptor.italic = italic
		}
		if (typeof underline !== 'undefined') {
			fontDescriptor.underline = underline
		}
		if (typeof strikeOut !== 'undefined') {
			fontDescriptor.strikeout = strikeOut
		}

		// console.debug("new Font", `${fontDescriptor.bold ? "bold" : ""} ${fontDescriptor.italic ? "italic" : ""}  ${fontDescriptor.fontsize}px ${fontDescriptor.fontname}`)

		return {
			tweaked,
			primaryColor,
			secondaryColor,
			outlineColor,
			shadowColor,
			scaleX,
			scaleY,
			spacing,
			angle,
			borderStyle,
			outline,
			shadow,
			alignment,
			position,
			fontDescriptor,
			custompositioning: typeof position !== 'undefined' ? true : false,
			animations
		} as Tweaks
	}

	upsacaleMove(moveAnimation: ASSAnimation.MoveValues): ASSAnimation.MoveValues {
		// if (this.playerResX === this.canvas.width && this.playerResY === this.canvas.height) return moveAnimation
		const [startX, startY, endX, endY, t1, t2] = moveAnimation
		const newStartX = ruleOfThree(this.playerResX, this.canvas.width) * startX / 100
		const newStartY = ruleOfThree(this.playerResY, this.canvas.height) * startY	/ 100
		const newEndX = ruleOfThree(this.playerResX, this.canvas.width) * endX / 100
		const newEndY = ruleOfThree(this.playerResY, this.canvas.height) * endY / 100

		if (typeof t1 === 'undefined') {
			return [newStartX, newStartY, newEndX, newEndY]
		} else {
			return [newStartX, newStartY, newEndX, newEndY, (t1 as number), (t2 as number)]
		}
	}

	drawTextV2(
		parsed: ParsedASSEventTextParsed[],
		marginL: number,
		marginV: number,
		marginR: number,
		fontDescriptor: FontDescriptor,
		debugLines: boolean = false
	) {
		// console.debug('drawTextV2', parsed)
		// This is an attempt to fix the issue with the text being drawn at the wrong position
		// And maybe also making tweaks easier to implement
		// I take the parsed text and draw it line by line, keeping track of the position of the last word
		// If the next word is a line break, I use the position of the last word to calculate the position of the line break
		// This is not perfect, but it's better than before
		let isAnimation = false
		let tweaks = this.teawksDrawSettings(parsed[0]?.tags ?? [], fontDescriptor)
		/* if (this.tweaksAppliedResult.animation.length > 0) {
			tweaks = this.animator.requestAnimation(
				this.tweaksAppliedResult.animation,
				this.currentHash,
				this.timeRange,
				tweaks
			)
			isAnimation = true
		} */
		this.applyTweaks(tweaks)
		if (this.tweaksAppliedResult.positionChanged) {
			this.drawTextAtPositionV2(
				parsed,
				fontDescriptor,
				isAnimation,
				tweaks,
				true
			)
			return
		}
		let parses = parsed.map((line) => line.text)
		let lines = makeLines(parses)
		let lineHeights = lines.map(
			(line) =>
				this.ctx.measureText(line).actualBoundingBoxAscent +
				this.ctx.measureText(line).actualBoundingBoxDescent
		)
		// console.debug('lineHeights', lineHeights)
		let lineHeight = Math.max(...lineHeights)
		let totalHeight = lineHeight * lines.length
		// console.debug('totalHeight', totalHeight)
		let previousTextWidth = 0
		let currentLine = 0

		// console.debug('lines', lines)
		let y = 0
		switch (this.textBaseline) {
			case 'top':
				y = marginV + (lines.length > 1 ? totalHeight / lines.length : lineHeight)
				break
			case 'middle':
				y = (this.canvas.height - totalHeight) / 2 + lineHeight
				break
			case 'bottom':
				y = this.canvas.height - marginV - (lines.length > 1 ? totalHeight / lines.length : 0)
				break
			default:
				y = marginV + lineHeight
				break
		}
		// console.debug('start-y', y)
		// console.debug('parses', parses)
		// console.debug('lines', lines)
		parses.forEach((_, index) => {
			let tag = this.flatTags(parsed[index]?.tags ?? [])
			// console.debug('tag', tag)
			// FIXME: tweaks interop the animation
			let tweaks = this.teawksDrawSettings(parsed[index]?.tags ?? [], fontDescriptor)
			this.applyTweaks(tweaks)
			let lineWidth = this.ctx.measureText(lines[currentLine] as string).width
			let x = 0
			switch (this.textAlign) {
				case 'left':
					x = marginL + previousTextWidth
					break
				case 'center':
					x = (this.canvas.width - lineWidth) / 2 + previousTextWidth
					break
				case 'right':
					x = this.canvas.width - marginR - lineWidth + previousTextWidth
					break
				default:
					x = marginL + previousTextWidth
					break
			}
			let parsedBatch = splitTextOnTheNextCharacter(parsed[index]?.text ?? '')
			// if in the parsed batch there is a word that is an empty string, remove it
			parsedBatch = parsedBatch.filter((word) => word !== '')
			let parsedBatchWithLineBreaks: string[] = []
			for (let i = 0; i < parsedBatch.length; i++) {
				let split = parsedBatch[i]?.split('\\N') ?? []
				if (split?.length === 1) {
					parsedBatchWithLineBreaks.push(parsedBatch[i] as string)
				} else {
					split.forEach((word, idx) => {
						parsedBatchWithLineBreaks.push(word)
						if (idx < split.length - 1) {
							parsedBatchWithLineBreaks.push('\\N')
						}
					})
				}
			}
			// remove empty strings
			parsedBatchWithLineBreaks = parsedBatchWithLineBreaks.filter((word) => word !== '')
			parsedBatch = parsedBatchWithLineBreaks
			// console.debug("parsedBatch", parsedBatch)
			let currentWordsWidth = 0

			parsedBatch.forEach((word, _) => {
				let wordWidth = this.ctx.measureText(word).width
				// console.debug('word', `"${word}"`)
				// console.debug('wordWidth', wordWidth)
				// console.debug('line', `"${lines[currentLine]}"`)
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
							x = marginL
							break
						case 'center':
							x = (this.canvas.width - lineWidth) / 2
							break
						case 'right':
							x = this.canvas.width - marginR - lineWidth
							break
						default:
							x = marginL
					}
				} else {

					if (this.ctx.lineWidth > 0) {
						this.ctx.strokeText(word, x + currentWordsWidth, y)
					}

					this.ctx.fillText(word, x + currentWordsWidth, y)
					currentWordsWidth += wordWidth
					previousTextWidth += wordWidth
				}
			})
		})
	}

	drawTextAtPositionV2(
		parsed: ParsedASSEventTextParsed[],
		fontDescriptor: FontDescriptor,
		isAnimation: boolean,
		appliedTweaks: Tweaks,
		debugLines: boolean = false
	) {
		let parses = parsed.map((line) => line.text)
		let lines = makeLines(parses)
		console.debug('lines', lines)
		let lineHeights = lines.map(
			(line) =>
				this.ctx.measureText(line).actualBoundingBoxAscent +
				this.ctx.measureText(line).actualBoundingBoxDescent
		)
		let lineHeight = Math.max(...lineHeights)
		let previousTextWidth = 0
		let currentLine = 0
		
		let y = this.tweaksAppliedResult.position[1] as number
		
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
		
		parses.forEach((_, index) => {
			console.log("index", parsed[index])
			let x = this.tweaksAppliedResult.position[0] as number
			let tag = this.flatTags(parsed[index]?.tags ?? [])
			let tweaks = this.teawksDrawSettings(parsed[index]?.tags ?? [], fontDescriptor)
			this.applyTweaks(tweaks)
			let lineWidth = this.ctx.measureText(lines[currentLine] as string).width
			switch (this.textAlign) {
				case 'left':
					x += previousTextWidth
					console.debug("left")
					break
				case 'center':
					x -= (lineWidth / 2) + previousTextWidth
					console.debug("center")
					break
				case 'right':
					x -= lineWidth + previousTextWidth
					console.debug("right")
					break
				default:
					x += previousTextWidth
					console.debug("default textAlign")
					break
			}

			let parsedBatch = splitTextOnTheNextCharacter(parsed[index]?.text ?? '')
			parsedBatch = parsedBatch.filter((word) => word !== '')
			let parsedBatchWithLineBreaks: string[] = []
			for (let i = 0; i < parsedBatch.length; i++) {
				let split = parsedBatch[i]?.split('\\N') ?? []
				if (split?.length === 1) {
					parsedBatchWithLineBreaks.push(parsedBatch[i] as string)
				} else {
					split.forEach((word, idx) => {
						parsedBatchWithLineBreaks.push(word)
						if (idx < split.length - 1) {
							parsedBatchWithLineBreaks.push('\\N')
						}
					})
				}
			}
			// remove empty strings
			parsedBatchWithLineBreaks = parsedBatchWithLineBreaks.filter((word) => word !== '')
			parsedBatch = parsedBatchWithLineBreaks
			let currentWordsWidth = 0			


			const xpos = this.tweaksAppliedResult.position[0] as number
			parsedBatch.forEach((word, _) => {
				// console.debug('word', `"${word}"`)
				let wordWidth = this.ctx.measureText(word).width
				if (word === '\\N') {
					currentLine++
					y += lineHeight
					previousTextWidth = 0
					currentWordsWidth = 0
					lineWidth = this.ctx.measureText(lines[currentLine] as string).width
					switch (this.textAlign) {
						case 'left':
							x = xpos
							break
						case 'center':
							x = (xpos - lineWidth) / 2
							break
						case 'right':
							x = xpos - lineWidth
							break
						default:
							x = xpos
					}
				} else {
					console.log("word", `"${word}"`, "x", x + currentWordsWidth, "y", y, "wordsWidth", currentWordsWidth)
					if (this.ctx.lineWidth > 0) {
						this.ctx.strokeText(word, x + currentWordsWidth, y)
					}
					this.ctx.fillText(word, x + currentWordsWidth, y)
					currentWordsWidth += wordWidth
					previousTextWidth += wordWidth
					if (debugLines) {
						let lastglobalAlpha = this.ctx.globalAlpha
						this.ctx.globalAlpha = 1
						let lastlineWidth = this.ctx.lineWidth
						this.ctx.lineWidth = 1
						let laststrokeStyle = this.ctx.strokeStyle
						this.ctx.strokeStyle = 'red'
						this.ctx.strokeRect(
							x + currentWordsWidth - wordWidth,
							y - lineHeight,
							wordWidth,
							lineHeight
						)
						this.ctx.lineWidth = lastlineWidth
						this.ctx.strokeStyle = laststrokeStyle
						this.ctx.globalAlpha = lastglobalAlpha
					}
				}
			})
		})
	}

	applyTweaks(tweaks: Tweaks) {
		let animations: ASSAnimation.Animation[] = []
		let positionChanged = false
		if (!tweaks.tweaked) {
			// console.debug('no tweaks')
			this.tweaksAppliedResult = {
				positionChanged: false,
				position: [0, 0],
				animation: animations,
			}
		} else {
			// console.debug('tweaks', tweaks)
			if (typeof tweaks.primaryColor === 'string') {
				this.ctx.fillStyle = tweaks.primaryColor
			}
			
			// if (typeof tweaks.secondaryColor === 'string') {
			// 	this.ctx.strokeStyle = tweaks.secondaryColor
			// }
			
			if (typeof tweaks.outlineColor === 'string') {
				this.ctx.strokeStyle = tweaks.outlineColor
			}
			
			if (typeof tweaks.shadowColor === 'string') {
				this.ctx.shadowColor = tweaks.shadowColor
			}
			
			if (typeof tweaks.outline === 'number') {
				if (tweaks.outline > 0) {
					this.ctx.lineWidth =
						((ruleOfThree(this.playerResX, this.canvas.width) * tweaks.outline) / 100) * 2
				} else {
					this.ctx.strokeStyle = 'transparent'
				}
			}
			
			if (typeof tweaks.shadow === 'number') {
				if (tweaks.shadow > 0) {
					this.ctx.shadowBlur =
						(ruleOfThree(this.playerResX, this.canvas.width) * tweaks.shadow) / 100
				} else {
					this.ctx.shadowBlur = 0
				}

				this.ctx.shadowOffsetX =
					(ruleOfThree(this.playerResX, this.canvas.width) * tweaks.shadow) / 100
				this.ctx.shadowOffsetY =
					(ruleOfThree(this.playerResX, this.canvas.width) * tweaks.shadow) / 100
			}
			
			if (typeof tweaks.fontDescriptor !== 'undefined') {
				this.ctx.font = ` ${tweaks.fontDescriptor.bold ? 'bold' : ''} ${
					tweaks.fontDescriptor.italic ? 'italic' : ''
				}  ${tweaks.fontDescriptor.fontsize}px ${tweaks.fontDescriptor.fontname}`
			}

			if (typeof tweaks.alignment !== 'undefined') {
				this.textAlign = this.getAlignment(tweaks.alignment) as CanvasTextAlign
				this.textBaseline = this.getBaseLine(tweaks.alignment as number) as CanvasTextBaseline
			}

			if (tweaks.animations.length > 0) {
				animations = tweaks.animations
				animations.forEach((animation) => {
					if (animation.name == "move") {
						let x = animation.values[0]
						let y = animation.values[1]
						this.tweaksAppliedResult = {
							positionChanged: true,
							position: [x, y],
							animation: animations,
						}
						positionChanged = true
						// console.debug('position', `${this.tweaksAppliedResult.position}`)
					}
				})
			}

			if (typeof tweaks.position !== 'undefined') {
				this.tweaksAppliedResult = {
					positionChanged: true,
					position: tweaks.position,
					animation: animations,
				}
				positionChanged = true
				// console.debug('position', `${this.tweaksAppliedResult.position}`)
			}
		}
		if (!positionChanged) {
			this.tweaksAppliedResult = {
				positionChanged: false,
				position: [0, 0],
				animation: animations,
			}
		}
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

	getStyle(styleName: string) {
		return this.styles.find((style) => style.Name === styleName)
	}

	getFontDescriptor(style: SingleStyle): FontDescriptor {
		const fontsize =
			(ruleOfThree(this.playerResY, this.canvas.height) * parseFloat(style.Fontsize)) / 100
		return {
			fontname: style.Fontname,
			fontsize: fontsize,
			bold: style.Bold === '-1',
			italic: style.Italic === '-1',
			underline: style.Underline === '-1',
			strikeout: style.StrikeOut === '-1'
		}
	}
}
