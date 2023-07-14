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
	if (color.startsWith('rgba')) {
		return color.replace(/rgba\((\d+), (\d+), (\d+), (\d+)\)/, `rgba($1, $2, $3, ${alpha})`)
	} else {
		// hexToRgba
		const rgba = hexToRgba(color)
		return rgba.replace(/rgba\((\d+), (\d+), (\d+), (\d+)\)/, `rgba($1, $2, $3, ${alpha})`)
	}
}

export function getAlphaFromColor(color: string) {
	if (color.startsWith('rgba')) {
		const alpha = color.replace(/rgba\((\d+), (\d+), (\d+), (\d+)\)/, '$4')
		// console.debug(color, "getAlphaFromColor", "rgba")
		return parseFloat(alpha)
	} else {
		// hexToRgba
		const rgba = hexToRgba(color)
		// console.debug(rgba, "getAlphaFromColor", "hex")
		return parseFloat(rgba.replace(/rgba\((\d+), (\d+), (\d+), (\d+)\)/, '$4'))
	}
}

export function rgbaToHex(rgba: string) {
  const components = rgba.match(/\d+/g) as string[]; // Extract numeric values from RGBA string
  let red = parseInt(components[0] as string);
  let green = parseInt(components[1] as string);
  let blue = parseInt(components[2] as string);
  let alpha = parseFloat(components[3] as string);

  let redHex = red.toString(16).padStart(2, '0');
  let greenHex = green.toString(16).padStart(2, '0');
  let blueHex = blue.toString(16).padStart(2, '0');

  let rgbHex = '#' + redHex + greenHex + blueHex;

  if (alpha !== 1) {
    let alphaHex = Math.round(alpha * 255).toString(16).padStart(2, '0');
    return rgbHex + alphaHex;
  }

  return rgbHex;
}


export function hexToRgba(hex: string) {
  const hexValue = hex.replace('#', ''); // Remove '#' if present
  const isShortHex = (hexValue.length === 3 || hexValue.length === 4);

  let redHex, greenHex, blueHex, alphaHex;
  if (isShortHex) {
    redHex = (hexValue[0] as string) + (hexValue[0] as string);
    greenHex = (hexValue[1] as string) + (hexValue[1] as string);
    blueHex = (hexValue[2] as string) + (hexValue[2] as string);
    if (hexValue.length === 4) {
      alphaHex = (hexValue[3] as string) + (hexValue[3] as string);
    } else {
      alphaHex = 'FF'; // Default alpha value if not provided
    }
  } else {
    redHex = hexValue.substring(0, 2);
    greenHex = hexValue.substring(2, 4);
    blueHex = hexValue.substring(4, 6);
    if (hexValue.length === 8) {
      alphaHex = hexValue.substring(6, 8);
    } else {
      alphaHex = 'FF'; // Default alpha value if not provided
    }
  }

  const red = parseInt(redHex, 16);
  const green = parseInt(greenHex, 16);
  const blue = parseInt(blueHex, 16);
  const alpha = parseInt(alphaHex, 16) / 255;

  return 'rgba(' + red + ', ' + green + ', ' + blue + ', ' + alpha + ')';
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
