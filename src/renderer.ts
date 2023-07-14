import type { ParsedASS, ParsedASSEventText, ParsedASSEventTextParsed } from 'ass-compiler'
import { SingleStyle, FontDescriptor, Tag, ASSAnimation, Shift, Tweaks } from './types'
import { ruleOfThree, convertAegisubToRGBA, insertTags } from './utils'

export class Renderer {
	parsedAss: ParsedASS
	canvas: HTMLCanvasElement
	ctx: CanvasRenderingContext2D
	video: HTMLVideoElement
	playerResX: number
	playerResY: number
	styles: SingleStyle[]
	textAlign: CanvasTextAlign = 'start'
	textBaseline: CanvasTextBaseline = 'alphabetic'

	previousTextWidth = 0
	previousTextPos = { x: 0, y: 0 }
	startBaseline = 0
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
			const { Style, Text, MarginL, MarginR, MarginV } = event
			const style = this.getStyle(Style)
			if (style === undefined) {
				return
			}
			this.showText(Text, style, { marginL: MarginL, marginR: MarginR, marginV: MarginV })
		})
	}

	showText(Text: ParsedASSEventText, style: SingleStyle, shift: Shift) {
		const textsInline = Text.parsed.map((textEvent) => textEvent.text)
		// console.debug(textsInline.join(''))
		let pos = [0, 0] as [number, number]

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
		const bold = typeof tagsCombined.b !== 'undefined' ? true : undefined
		const italic = typeof tagsCombined.i !== 'undefined' ? true : undefined
		const underline = typeof tagsCombined.u !== 'undefined' ? true : undefined
		const strikeOut = typeof tagsCombined.s !== 'undefined' ? true : undefined
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
		const MoveAnimation = typeof tagsCombined.move !== 'undefined' ? tagsCombined.move : undefined
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
						name: 'fad',
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

	makeLines(strArr: string[]) {
		/*
		`[ "On a notre nouvelle reine\\Ndes ", "scream queens", "." ]` -> `["On a notre nouvelle reine", "des scream queens."]`
		`[ "Bunch of ", "losers", "." ]` -> `["Bunch of losers."]`
		`[ "Bunch of ", "losers", "\\Nand ", "nerds", "." ]` ->  `["Bunch of losers", "and nerds."]`
		A special case is when after the first parse we have a line that ends with \N, in that case we remove the \N and add an empty string to the result array
		[ "ÉPISODE", "25", "\\N", "\\N", "TRÉSOR", "CACHÉ" ] -> [ "ÉPISODE 25\\N", "TRÉSOR CACHÉ" ] -> [ "ÉPISODE 25", "", "TRÉSOR CACHÉ" ]
		(empty line is added to the result array)
		*/
		let result = []
		let line = ''
		for (let i = 0; i < strArr.length; i++) {
			line += strArr[i]
			if (strArr[i]?.includes('\\N')) {
				let split = strArr[i]?.split('\\N') as string[]
				line = line.replace('\\N' + split[1], '')
				result.push(line)
				line = split[1] as string
			}
		}
		result.push(line)

		let newRes = [] as string[]
		for (let i = 0; i < result.length; i++) {
			if (result[i]?.endsWith('\\N')) {
				let count = (result[i]?.match(/\\N/g) || []).length
				newRes.push(result[i]?.replace('\\N', '') as string)
				for (let j = 0; j < count; j++) {
					newRes.push('')
				}
			} else {
				newRes.push(result[i] as string)
			}
		}
		
		return newRes
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
		let parses = parsed.map((line) => line.text)
		let tweaks = this.teawksDrawSettings(parsed[0]?.tags ?? [], fontDescriptor)
		let checkpos = this.applyTweaks(tweaks)
		if (checkpos.positionChanged) {
			this.drawTextAtPositionV2(
				parsed,
				checkpos.position as [number, number],
				fontDescriptor,
				false
			)
			return
		}
		let lineHeights = parses.map(
			(parses) =>
				this.ctx.measureText(parses).actualBoundingBoxAscent +
				this.ctx.measureText(parses).actualBoundingBoxDescent
		)
		let lineHeight = Math.max(...lineHeights)
		let totalHeight = lineHeight * parses.length
		let previousTextWidth = 0
		let previousTextPos = { x: 0, y: 0 }
		let currentLine = 0

		let lines = this.makeLines(parses)
		// console.debug('lines', lines)
		let y = 0
		switch (this.textBaseline) {
			case 'top':
				y = marginV + lineHeight
				// if (lines.length > 1) { y -= totalHeight / lines.length; }
				break
			case 'middle':
				y = (this.canvas.height - totalHeight) / 2 + lineHeight
				break
			case 'bottom':
				y = this.canvas.height - marginV
				if (parses.length === 1) {
					y -= lineHeight
				}
				break
			default:
				y = marginV + lineHeight
				break
		}
		// console.debug('parses', parses)
		// console.debug('lines', lines)
		parses.forEach((parse, index) => {
			let tag = this.flatTags(parsed[index]?.tags ?? [])
			// console.debug('tag', tag)
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
			let parsedBatch = parsed[index]?.text.split(' ') ?? []
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

			parsedBatch.forEach((word, index) => {
				let wordWidth = this.ctx.measureText(word).width
				if (word === '\\N') {
					currentLine++
					y += lineHeight
					previousTextWidth = 0
					previousTextPos = { x: 0, y: 0 }
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
					if (index === 0) {
						previousTextPos = { x, y }
					}

					if (this.ctx.lineWidth > 0) {
						this.ctx.strokeText(word, x + currentWordsWidth, y)
					}

					this.ctx.fillText(word, x + currentWordsWidth, y)
					currentWordsWidth += wordWidth + this.ctx.measureText(' ').width
					previousTextWidth += wordWidth + this.ctx.measureText(' ').width
				}
			})
		})
	}

	drawTextAtPositionV2(
		parsed: ParsedASSEventTextParsed[],
		position: [number, number],
		fontDescriptor: FontDescriptor,
		debugLines: boolean = false
	) {
		let tweaks = this.teawksDrawSettings(parsed[0]?.tags ?? [], fontDescriptor)
		this.applyTweaks(tweaks)
		let parses = parsed.map((line) => line.text)
		let lineHeights = parses.map(
			(line) =>
				this.ctx.measureText(line).actualBoundingBoxAscent +
				this.ctx.measureText(line).actualBoundingBoxDescent
		)
		let lineHeight = Math.max(...lineHeights)
		let totalHeight = lineHeight * parses.length
		let y = position[1]
		switch (this.textBaseline) {
			case 'top':
				y += lineHeight
				if (parses.length > 1) {
					y -= totalHeight / parses.length
				}
				break
			case 'middle':
				y += lineHeight / 2
				if (parses.length > 1) {
					y -= totalHeight / parses.length / 2
				}
				break
			case 'bottom':
				y -= lineHeight
				break
			default:
				y += lineHeight
				if (parses.length > 1) {
					y -= totalHeight / parses.length
				}
				break
		}
		let previousTextWidth = 0
		let previousTextPos = { x: 0, y: 0 }
		let currentLine = 0
		let lines = this.makeLines(parses)

		parses.forEach((parse, index) => {
			let tag = this.flatTags(parsed[index]?.tags ?? [])
			// console.debug('tag', tag)
			let tweaks = this.teawksDrawSettings(parsed[index]?.tags ?? [], fontDescriptor)
			this.applyTweaks(tweaks)
			let lineWidth = this.ctx.measureText(lines[currentLine] as string).width
			let x = 0
			switch (this.textAlign) {
				case 'left':
					x = position[0] + previousTextWidth
					break
				case 'center':
					x = position[0] - lineWidth / 2 + previousTextWidth
					break
				case 'right':
					x = position[0] - lineWidth + previousTextWidth
					break
				default:
					x = position[0] + previousTextWidth
					break
			}

			let parsedBatch = parsed[index]?.text.split(' ') ?? []
			// if in the parsed batch there is a word that is an empty string, it will change to a space
			// because of the split, so I need to change it back
			for (let i = 0; i < parsedBatch.length; i++) {
				if (parsedBatch[i] === '') {
					parsedBatch[i] = ' '
				}
			}
			// [ "Sûrement", "à", "cause", "des", "nombreux", "accidents\\Nde", "l’année", "précédente." ]
			// [ "Sûrement", "à", "cause", "des", "nombreux", "accidents", "\\N" "de", "l’année", "précédente." ]
			// The problem is that the line break is not a word, so it's not in the parsed batch
			// I go through the parsed batch and create a new one with the line breaks
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
			parsedBatch = parsedBatchWithLineBreaks
			// console.debug("parsedBatch", parsedBatch)
			let currentWordsWidth = 0

			parsedBatch.forEach((word, index) => {
				let wordWidth = this.ctx.measureText(word).width
				if (word === '\\N') {
					currentLine++
					y += lineHeight
					previousTextWidth = 0
					previousTextPos = { x: 0, y: 0 }
					currentWordsWidth = 0
					lineWidth = this.ctx.measureText(lines[currentLine] as string).width
					// console.debug('line', lines[currentLine])
					switch (this.textAlign) {
						case 'left':
							x = position[0]
							break
						case 'center':
							x = position[0] - lineWidth / 2
							break
						case 'right':
							x = position[0] - lineWidth
							break
						default:
							x = position[0]
					}
				} else {
					if (index === 0) {
						previousTextPos = { x, y }
					}

					if (this.ctx.lineWidth > 0) {
						this.ctx.strokeText(word, x + currentWordsWidth, y)
					}

					this.ctx.fillText(word, x + currentWordsWidth, y)
					currentWordsWidth += wordWidth + this.ctx.measureText(' ').width
					previousTextWidth += wordWidth + this.ctx.measureText(' ').width
				}
			})
		})
	}

	applyTweaks(tweaks: Tweaks) {
		if (!tweaks.tweaked) {
			// console.debug('no tweaks')
			return {
				positionChanged: false,
				position: [0, 0]
			}
		} else {
			// console.debug('tweaks', tweaks)
			if (typeof tweaks.primaryColor === 'string') {
				this.ctx.fillStyle = tweaks.primaryColor
			}
			if (typeof tweaks.secondaryColor === 'string') {
				this.ctx.strokeStyle = tweaks.secondaryColor
			}
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
			if (typeof tweaks.position !== 'undefined') {
				return {
					positionChanged: true,
					position: tweaks.position
				}
			}
		}

		return {
			positionChanged: false,
			position: [0, 0]
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
