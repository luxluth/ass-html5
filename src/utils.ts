/**
 * Convert a color in RGBA format to Aegisub format
 * @param aegisubColor The color in Aegisub format
 * @returns The color in RGBA format
 */
export function convertAegisubToRGBA(aegisubColor: string) {
	aegisubColor = aegisubColor.replace(/&H/g, '').replace(/&/g, '')
	let alpha = parseInt(aegisubColor.slice(0, 2), 16) / 255 + 1
	let red = parseInt(aegisubColor.slice(2, 4), 16)
	let green = parseInt(aegisubColor.slice(4, 6), 16)
	let blue = parseInt(aegisubColor.slice(6, 8), 16)

	return 'rgba(' + red + ',' + green + ',' + blue + ',' + alpha + ')'
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
	}
	return canvas;
}

