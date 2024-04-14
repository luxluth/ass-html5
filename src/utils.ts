import { DialogueFragment } from 'ass-compiler';
import { type Tag } from './types';
/**
 * Convert a color in RGBA format to Aegisub format
 * @param aegisubColor The color in Aegisub format
 * @returns The color in RGBA format
 */
export function convertAegisubColorToHex(aegisubColor: string) {
  const colorValue = aegisubColor.replace(/&H|&/g, '');

  // Extract the individual color components from the Aegisub color value
  const blue = parseInt(colorValue.slice(2, 4), 16);
  const green = parseInt(colorValue.slice(4, 6), 16);
  const red = parseInt(colorValue.slice(6, 8), 16);

  // Create the RGBA
  const rgba = `rgb(${red}, ${green}, ${blue}, 1)`;
  const hex = rgbaToHex(rgba);
  return hex;
}

export function swapBBGGRR(color: string) {
  // color : #FF0008 -> #0800FF
  const colorValue = color.replace('#', '');
  const blue = colorValue.slice(0, 2);
  const green = colorValue.slice(2, 4);
  const red = colorValue.slice(4, 6);
  return `#${red}${green}${blue}`;
}

export function changeAlpha(color: string, alpha: number) {
  if (color.startsWith('rgba')) {
    return color.replace(/rgba\((\d+), (\d+), (\d+), (\d+)\)/, `rgba($1, $2, $3, ${alpha})`);
  } else {
    // hexToRgba
    const rgba = hexToRgba(color);
    return rgba.replace(/rgba\((\d+), (\d+), (\d+), (\d+)\)/, `rgba($1, $2, $3, ${alpha})`);
  }
}

export function getAlphaFromColor(color: string) {
  if (color.startsWith('rgba')) {
    const alpha = color.replace(/rgba\((\d+), (\d+), (\d+), (\d+)\)/, '$4');
    // console.debug(color, "getAlphaFromColor", "rgba")
    return parseFloat(alpha);
  } else {
    // hexToRgba
    const rgba = hexToRgba(color);
    // console.debug(rgba, "getAlphaFromColor", "hex")
    return parseFloat(rgba.replace(/rgba\((\d+), (\d+), (\d+), (\d+)\)/, '$4'));
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
    let alphaHex = Math.round(alpha * 255)
      .toString(16)
      .padStart(2, '0');
    return rgbHex + alphaHex;
  }

  return rgbHex;
}

export function hexToRgba(hex: string, defaultAlpha = 1) {
  const hexValue = hex.replace('#', ''); // Remove '#' if present
  const isShortHex = hexValue.length === 3 || hexValue.length === 4;

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
    tag = { ...tag, ...singleTag };
  });
  return tag;
}

export function getAlphaFromTag(tags: Tag) {
  let alpha = 1;
  if (typeof tags.alpha !== 'undefined') {
    alpha = parseFloat(tags.alpha);
  }
  // console.debug(`Alpha: ${alpha}`);
  return alpha;
}

export function ruleOfThree(value: number, valueMin: number) {
  return (valueMin * 100) / value;
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

export function randomId(parts: number, separator = '-', prefix = '', ln = 10) {
  const partsArray = [];
  for (let i = 0; i < parts; i++) {
    partsArray.push(genRandomString(ln));
  }
  return prefix + partsArray.join(separator);
}

export function hashString(str: string) {
  let hash = 0;
  if (str.length == 0) {
    return hash;
  }
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash;
}

export function newRender(
  top: number,
  left: number,
  width: number,
  height: number,
  zIndex?: number,
  insertAfter?: HTMLElement
) {
  const render = document.createElement('div');
  render.id = randomId(2, '-', 'ASSRendererRender-', 5);
  render.style.position = 'absolute';
  render.style.width = width + 'px';
  render.style.height = height + 'px';
  render.style.top = top + 'px';
  render.style.left = left + 'px';
  render.style.pointerEvents = 'none';
  render.style.overflow = 'hidden';
  render.style.boxSizing = 'border-box';
  render.style.padding = '0px';
  render.style.margin = '0px';
  if (zIndex) {
    render.style.zIndex = zIndex.toString();
  }

  if (insertAfter) {
    insertAfter.after(render);
  } else {
    document.body.appendChild(render);
  }

  return render;
}

export function newCanvas(
  width: number,
  height: number,
  dataLayer = 0,
  layerName?: string,
  appendIn?: HTMLElement,
  insertAfter?: HTMLElement
) {
  const canvas = document.createElement('canvas');
  canvas.id = randomId(2, '-', 'Canvas-', 5);
  canvas.style.position = 'absolute';
  canvas.style.top = '0px';
  canvas.style.left = '0px';
  canvas.style.pointerEvents = 'none';
  canvas.width = width;
  canvas.height = height;
  canvas.dataset.layer = dataLayer.toString();
  canvas.dataset.identifier = uuidgen();

  if (layerName) {
    canvas.dataset.name = layerName;
  }

  if (insertAfter) {
    insertAfter.after(canvas);
  } else {
    if (!appendIn) {
      appendIn = document.body;
    }
    appendIn.appendChild(canvas);
  }
  return canvas;
}

export function uuidgen() {
  const v4 = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
  return v4.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function makeLines(frags: DialogueFragment[]) {
  /*
	`[ "On a notre nouvelle reine\\Ndes ", "scream queens", "." ]` -> `["On a notre nouvelle reine", "des scream queens."]`
	`[ "Bunch of ", "winners", "." ]` -> `["Bunch of winners."]`
	`[ "Bunch of ", "coders", "\\Nand ", "nerds", "." ]` ->  `["Bunch of coders", "and nerds."]`
	A special case is when after the first parse we have a line that ends with \N, in that case we remove the \N and add an empty string to the result array
	[ "ÉPISODE", "25", "\\N", "\\N", "TRÉSOR", "CACHÉ" ] -> [ "ÉPISODE 25\\N", "TRÉSOR CACHÉ" ] -> [ "ÉPISODE 25", "", "TRÉSOR CACHÉ" ]
	(empty line is added to the result array)
	*/
  let result = [];
  let line = '';
  for (let i = 0; i < frags.length; i++) {
    line += frags[i]?.text as string;
    if (frags[i]?.text.includes('\\N')) {
      let split = frags[i]?.text.split('\\N') as string[];
      line = line.replace('\\N' + split[1], '');
      result.push(line);
      line = split[1] as string;
    }
  }
  result.push(line);

  let newRes = [] as string[];
  for (let i = 0; i < result.length; i++) {
    if (result[i]?.endsWith('\\N')) {
      let count = (result[i]?.match(/\\N/g) || []).length;
      newRes.push(result[i]?.replace('\\N', '') as string);
      for (let j = 0; j < count; j++) {
        newRes.push('');
      }
    } else {
      newRes.push(result[i] as string);
    }
  }

  return newRes;
}

export function splitTextOnTheNextCharacter(text: string) {
  // Hello world -> [ "Hello ", "world" ]
  // Hello world! -> [ "Hello ", "world!" ]

  let result = [] as string[];
  let line = '';
  let spaceEncountered = false;
  let wordEncountered = false;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === ' ') {
      spaceEncountered = true;
      wordEncountered = false;
    } else {
      wordEncountered = true;
    }
    if (spaceEncountered && wordEncountered) {
      result.push(line);
      line = '';
      spaceEncountered = false;
    }
    line += text[i];
  }

  if (line.length > 0) {
    result.push(line);
  }
  return result;
}

export function separateNewLine(words: string[]) {
  // ["Hello ", "world!\Ntoday ", "is ", "a ", "good ", "day."] -> ["Hello ", "world!", "\N", "today ", "is ", "a ", "good ", "day."]
  words = words.filter((word) => word !== '');
  let wordsWithLineBreaks: string[] = [];
  for (let i = 0; i < words.length; i++) {
    let split = words[i]?.split('\\N') ?? [];
    if (split?.length === 1) {
      wordsWithLineBreaks.push(words[i] as string);
    } else {
      split.forEach((word, idx) => {
        wordsWithLineBreaks.push(word);
        if (idx < split.length - 1) {
          wordsWithLineBreaks.push('\\N');
        }
      });
    }
  }

  return wordsWithLineBreaks;
}

export function blendAlpha(color: string, alpha: number) {
  color = color.replace('#', '');
  // color = FFFFFF
  // alpha = 80
  // return rgba(255, 255, 255, 0.5)
  const red = parseInt(color.substring(0, 2), 16);
  const green = parseInt(color.substring(2, 4), 16);
  const blue = parseInt(color.substring(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha == 0 ? 1 : alpha / 160})`;
}

export class Vector2 {
  x: number;
  y: number;
  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  static add(lhs: Vector2, rhs: Vector2): Vector2 {
    return {
      x: lhs.x + rhs.x,
      y: lhs.y + rhs.y
    };
  }
  static sub(lhs: Vector2, rhs: Vector2): Vector2 {
    return {
      x: lhs.x - rhs.x,
      y: lhs.y - rhs.y
    };
  }
  static mul(lhs: Vector2, i: number): Vector2 {
    return {
      x: lhs.x * i,
      y: lhs.y * i
    };
  }
}

/**
 * Interpolate a vector2 between tow vector2
 * @param start - starting point
 * @param end - the end point
 * @param t a value between 0..1
 * start + (end - start) * t
 */
export function linearInterpolation(start: Vector2, end: Vector2, t: number): Vector2 {
  return Vector2.add(start, Vector2.mul(Vector2.sub(end, start), t));
}

export function liStep(
  step: Vector2,
  at: number,
  start: Vector2,
  end: Vector2,
  t: number
): Vector2 {
  if (at <= t) {
    return linearInterpolation(start, step, at);
  } else {
    return linearInterpolation(step, end, t);
  }
}
