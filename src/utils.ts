import type { Tag } from "./types";
/**
 * Convert a color in RGBA format to Aegisub format
 * @param aegisubColor The color in Aegisub format
 * @returns The color in RGBA format
 */
export function convertAegisubToRGBA(aegisubColor: string, tags: Tag[]) {
	const colorValue = aegisubColor.replace(/&H|&/g, '');

	// Extract the individual color components from the Aegisub color value
	const alpha = getAlpha(tags);
	const blue = parseInt(colorValue.slice(2, 4), 16);
	const green = parseInt(colorValue.slice(4, 6), 16);
	const red = parseInt(colorValue.slice(6, 8), 16);

	// Create the RGBA string
	const rgba = `rgba(${red}, ${green}, ${blue}, ${alpha})`;
	console.debug(`Converted ${aegisubColor} to ${rgba}`);
	return rgba;
}

export function getAlpha(tags: Tag[]) {
	let alpha = 1;
	let tagsCombined: Tag = {};
	tags.forEach((tag) => {tagsCombined = { ...tagsCombined, ...tag }})
	if (typeof tagsCombined.alpha !== 'undefined') {alpha = parseFloat(tagsCombined.alpha);}
	return alpha;
}

export function ruleOfThree(
	value: number,
	valueMin: number,
) {
	return (valueMin * 100) / value
}

export function genRandomString(ln: number) {
	const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let randomString = '';

	for (let i = 0; i < ln; i++) {
	const randomIndex = Math.floor(Math.random() * characters.length);
	randomString += characters.charAt(randomIndex);
	}

	return randomString;
}

export function newCanvas(top: number, left: number, width: number, height: number, insertAfter?: HTMLElement, zIndex?: number) {
	const canvas = document.createElement('canvas');
	canvas.id = "ASSRendererCanvas-" + genRandomString(10);
	canvas.style.position = 'absolute';
	canvas.style.width = width + 'px';
	canvas.style.height = height + 'px';
	canvas.width = width;
	canvas.height = height;
	canvas.style.top = top + 'px';
	canvas.style.left = left + 'px';
	canvas.style.pointerEvents = 'none';
	canvas.width = width;
	canvas.height = height;

	if (zIndex) {
		canvas.style.zIndex = zIndex.toString();
	}

	if (insertAfter) {
		insertAfter.after(canvas);
	} else {
		document.body.appendChild(canvas);
	}
	return canvas;
}

