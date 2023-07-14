import type { Tag } from './types'
/**
 * Convert a color in RGBA format to Aegisub format
 * @param aegisubColor The color in Aegisub format
 * @returns The color in RGBA format
 */
export function convertAegisubToRGBA(aegisubColor: string, tags?: Tag, defaultAlpha = 1) {
	const colorValue = aegisubColor.replace(/&H|&/g, '')

	// Extract the individual color components from the Aegisub color value
	const alpha = tags ? getAlphaFromTag(tags) : defaultAlpha
	const blue = parseInt(colorValue.slice(2, 4), 16)
	const green = parseInt(colorValue.slice(4, 6), 16)
	const red = parseInt(colorValue.slice(6, 8), 16)

	// Create the RGBA string
	const rgba = `rgba(${red}, ${green}, ${blue}, ${alpha})`
	// console.debug(`Converted ${aegisubColor} to ${rgba}`);
	return rgba
}

export function changeAlpha(color: string, alpha: number) {
	return color.replace(/rgba\((\d+), (\d+), (\d+), (\d+)\)/, `rgba($1, $2, $3, ${alpha})`)
}

export function getAlphaFromColor(color: string) {
	const alpha = color.replace(/rgba\((\d+), (\d+), (\d+), (\d+)\)/, '$4')
	return parseFloat(alpha)
}

export function insertTags(tags: Tag[], tag: Tag) {
	tags.forEach((singleTag) => {
		// if the tag is already present, it will be overwritten
		tag = { ...tag, ...singleTag }
	})
	return tag
}

export function getAlphaFromTag(tags: Tag) {
	let alpha = 1
	if (typeof tags.alpha !== 'undefined') {
		alpha = parseFloat(tags.alpha)
	}
	// console.debug(`Alpha: ${alpha}`);
	return alpha
}

export function ruleOfThree(value: number, valueMin: number) {
	return (valueMin * 100) / value
}

export function genRandomString(ln: number) {
	const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
	let randomString = ''

	for (let i = 0; i < ln; i++) {
		const randomIndex = Math.floor(Math.random() * characters.length)
		randomString += characters.charAt(randomIndex)
	}

	return randomString
}

export function randomId(parts: number, separator='-', prefix='', ln= 10) {
	const partsArray = []
	for (let i = 0; i < parts; i++) {
		partsArray.push(genRandomString(ln))
	}
	return prefix + partsArray.join(separator)
}

export function hashString(str: string) {
	let hash = 0
	if (str.length == 0) {
		return hash
	}
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i)
		hash = (hash << 5) - hash + char
		hash = hash & hash // Convert to 32bit integer
	}
	return hash
}

export function newCanvas(
	top: number,
	left: number,
	width: number,
	height: number,
	insertAfter?: HTMLElement,
	zIndex?: number
) {
	const canvas = document.createElement('canvas')
	canvas.id = randomId(2, '-', 'ASSRendererCanvas-', 5)
	canvas.style.position = 'absolute'
	canvas.style.width = width + 'px'
	canvas.style.height = height + 'px'
	canvas.width = width
	canvas.height = height
	canvas.style.top = top + 'px'
	canvas.style.left = left + 'px'
	canvas.style.pointerEvents = 'none'
	canvas.width = width
	canvas.height = height

	if (zIndex) {
		canvas.style.zIndex = zIndex.toString()
	}

	if (insertAfter) {
		insertAfter.after(canvas)
	} else {
		document.body.appendChild(canvas)
	}
	return canvas
}
