import { type Tag, type Char, CHARKIND, FadeAnimation, FadeKind } from './types';
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

export function hexToRgba(hex: string) {
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
  let partsArray: string[] = [];
  for (let i = 0; i < parts; i++) {
    partsArray.push(genRandomString(ln));
  }
  return prefix + partsArray.join(separator);
}

export function stringHash(str: string) {
  let hash = 0;

  if (str.length == 0) return hash;

  for (let i = 0; i < str.length; i++) {
    let char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }

  return hash;
}

export function chunkCharWidth(chars: Char[]) {
  let w = 0;
  for (let i = 0; i < chars.length; i++) {
    let char = chars[i] as Char;
    if (char.kind == CHARKIND.NORMAL) {
      w += char.w;
    } else if (char.kind == CHARKIND.DRAWING) {
      w += char.w;
    }
  }

  return w;
}

export function chunkCharToString(chars: Char[]) {
  let w = '';
  for (let i = 0; i < chars.length; i++) {
    let char = chars[i] as Char;
    if (char.kind == CHARKIND.NORMAL) {
      w += char.c;
    }
  }

  return w;
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
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  const canvas = document.createElement('canvas');
  canvas.id = randomId(2, '-', 'Canvas-', 5);
  canvas.style.position = 'absolute';
  canvas.style.top = '0px';
  canvas.style.left = '0px';
  canvas.style.pointerEvents = 'none';
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
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

export function parseAlpha(of?: string | number) {
  if (of === undefined || of === null || of === '') return 0;
  if (typeof of === 'number') return of;
  const clean = of.toString().replace(/&H|&/gi, '');
  return parseInt(clean, 16) || 0;
}

export function blendAlpha(color: string, alpha: number) {
  color = color ? color.replace('#', '') : '000000';
  const red = parseInt(color.substring(0, 2), 16) || 0;
  const green = parseInt(color.substring(2, 4), 16) || 0;
  const blue = parseInt(color.substring(4, 6), 16) || 0;
  // In ASS, alpha 0 = fully opaque (1), alpha 255 = fully transparent (0)
  const a = Math.max(0, Math.min(1, (255 - alpha) / 255));
  return `rgba(${red}, ${green}, ${blue}, ${a.toFixed(3)})`;
}

/** Color between two `#RRGGBB` colors, at `t` from 0 (the first) to 1 (the second) */
export function interpolateColor(color1: string, color2: string, t: number): string {
  const c1Clean = (color1 || '#000000').replace('#', '');
  const c2Clean = (color2 || '#000000').replace('#', '');
  const r1 = parseInt(c1Clean.substring(0, 2), 16) || 0;
  const g1 = parseInt(c1Clean.substring(2, 4), 16) || 0;
  const b1 = parseInt(c1Clean.substring(4, 6), 16) || 0;
  const r2 = parseInt(c2Clean.substring(0, 2), 16) || 0;
  const g2 = parseInt(c2Clean.substring(2, 4), 16) || 0;
  const b2 = parseInt(c2Clean.substring(4, 6), 16) || 0;
  const r = Math.min(255, Math.max(0, Math.round(r1 + (r2 - r1) * t)));
  const g = Math.min(255, Math.max(0, Math.round(g1 + (g2 - g1) * t)));
  const b = Math.min(255, Math.max(0, Math.round(b1 + (b2 - b1) * t)));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export class Vector2 {
  x: number;
  y: number;
  constructor(x: number = 0, y: number = 0) {
    this.x = x;
    this.y = y;
  }

  add(rhs: Vector2): Vector2 {
    return new Vector2(this.x + rhs.x, this.y + rhs.y);
  }
  sub(rhs: Vector2): Vector2 {
    return new Vector2(this.x - rhs.x, this.y - rhs.y);
  }
  mul(i: number): Vector2 {
    return new Vector2(this.x * i, this.y * i);
  }
}

/**
 * Interpolate a vector2 between tow vector2
 * @param start - starting point
 * @param end - the end point
 * @param t a value between 0 and 1
 * @returns A new Vector2 representing the interpolated point
 */
export function vectorLerp(start: Vector2, end: Vector2, t: number): Vector2 {
  // start + (end - start) * t
  return start.add(end.sub(start).mul(t));
}

export function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

/**
 * Produce a fade-in and fade-out effect. The fadein and fadeout times are
 * given in milliseconds, ie. 1000 means one second. You can specify fadein or
 * fadeout as 0 (zero) to not have any fade effect on that end.
 */
export function getOpacity(
  fade: Extract<FadeAnimation, { type: FadeKind.Simple }>,
  startTime: number,
  endTime: number,
  time: number
): number {
  const fadeIn = startTime + fade.fadein;
  const fadeOut = endTime - fade.fadeout;
  if (time < fadeIn) {
    let t = fadeIn > startTime ? (time - startTime) / (fadeIn - startTime) : 1;
    return Math.max(0, Math.min(1, lerp(0, 1, t)));
  } else if (time >= fadeIn && time < fadeOut) {
    return 1;
  } else if (time >= fadeOut && time <= endTime) {
    let t = endTime > fadeOut ? (time - fadeOut) / (endTime - fadeOut) : 1;
    return Math.max(0, Math.min(1, lerp(1, 0, t)));
  } else {
    return 0;
  }
}

/**
 * Perform a five-part fade using three alpha values a1, a2 and a3 and four
 * times t1, t2, t3 and t4.
 *
 * The alpha values are given in decimal and are between 0 and 255, with 0
 * being fully visible and 255 being invisible. The time values are given in
 * milliseconds after the start of the line. All seven parameters are
 * required. (For most common fade effects the `\fad` tag works fine.)
 *
 * - Before t1, the line has alpha a1.
 * - Between t1 and t2 the line fades from alpha a1 to alpha a2.
 * - Between t2 and t3 the line has alpha a2 constantly.
 * - Between t3 and t4 the line fades from alpha a2 to alpha a3.
 * - After t4 the line has alpha a3.
 */
export function getOpacityComplex(
  fade: Extract<FadeAnimation, { type: FadeKind.Complex }>,
  startTime: number,
  endTime: number,
  time: number
): number {
  const t1 = startTime + fade.t1;
  const t2 = startTime + fade.t2;
  const t3 = startTime + fade.t3;
  const t4 = startTime + fade.t4;

  let rawAlpha = fade.a1;
  if (time < t1) {
    rawAlpha = fade.a1;
  } else if (time >= t1 && time < t2) {
    let t = t2 > t1 ? (time - t1) / (t2 - t1) : 1;
    rawAlpha = lerp(fade.a1, fade.a2, t);
  } else if (time >= t2 && time < t3) {
    rawAlpha = fade.a2;
  } else if (time >= t3 && time < t4) {
    let t = t4 > t3 ? (time - t3) / (t4 - t3) : 1;
    rawAlpha = lerp(fade.a2, fade.a3, t);
  } else {
    rawAlpha = fade.a3;
  }

  return Math.max(0, Math.min(1, (255 - rawAlpha) / 255));
}

/** A font name as written in the script, without quotes and the `@` of vertical fonts */
export function cleanFontName(name: string) {
  return name
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/^@/, '');
}

/** "Source Sans Pro Semibold" → "Source Sans Pro" */
export function stripWeightSuffix(name: string) {
  return name.replace(/\s+(semibold|bold|regular|light|medium|black|italic)/i, '').trim();
}

export interface FontMetrics {
  unitsPerEm: number;
  winAscent: number;
  winDescent: number;
  ratio: number;
  /** Windows family, full and PostScript names: the names libass finds the font by */
  names: string[];
}

/**
 * Extract OpenType / TrueType font metrics (unitsPerEm, usWinAscent, usWinDescent)
 * from a binary font ArrayBuffer to replicate VSFilter / libass font sizing.
 *
 * In libass / VSFilter, FontSize does not map to the EM-square directly.
 * Instead, the font is scaled so that the cell height (usWinAscent + usWinDescent)
 * matches the ASS FontSize. In CSS / Canvas 2D, font-size sets the EM-square.
 * Therefore, CSS fontSize = ASS fontSize * (unitsPerEm / (usWinAscent + usWinDescent)).
 *
 * Also reads the names of the face. WOFF, WOFF2 and font collections are not read: they give a
 * ratio of 1 and no names.
 */
export function parseFontMetrics(buffer: ArrayBuffer): FontMetrics {
  const unknown: FontMetrics = {
    unitsPerEm: 1000,
    winAscent: 0,
    winDescent: 0,
    ratio: 1,
    names: []
  };
  try {
    const view = new DataView(buffer);
    if (buffer.byteLength < 12) {
      return unknown;
    }

    // TrueType (0x00010000 or 'true') and CFF ('OTTO') outlines
    const signature = view.getUint32(0);
    if (signature !== 0x00010000 && signature !== 0x74727565 && signature !== 0x4f54544f) {
      return unknown;
    }

    const numTables = view.getUint16(4);
    let headOffset = 0;
    let os2Offset = 0;
    let hheaOffset = 0;
    let nameOffset = 0;

    for (let i = 0; i < numTables; i++) {
      const offset = 12 + i * 16;
      if (offset + 16 > buffer.byteLength) break;
      const tag = String.fromCharCode(
        view.getUint8(offset),
        view.getUint8(offset + 1),
        view.getUint8(offset + 2),
        view.getUint8(offset + 3)
      );
      if (tag === 'head') headOffset = view.getUint32(offset + 8);
      else if (tag === 'OS/2') os2Offset = view.getUint32(offset + 8);
      else if (tag === 'hhea') hheaOffset = view.getUint32(offset + 8);
      else if (tag === 'name') nameOffset = view.getUint32(offset + 8);
    }

    let unitsPerEm = 1000;
    if (headOffset && headOffset + 20 <= buffer.byteLength) {
      const upem = view.getUint16(headOffset + 18);
      if (upem > 0) unitsPerEm = upem;
    }

    let winAscent = 0;
    let winDescent = 0;
    if (os2Offset && os2Offset + 78 <= buffer.byteLength) {
      winAscent = view.getUint16(os2Offset + 74);
      winDescent = view.getUint16(os2Offset + 76);
    }

    // Fonts without usWin* metrics fall back to the typographic ones, then to hhea
    let cellHeight = winAscent + winDescent;
    if (cellHeight === 0 && os2Offset && os2Offset + 72 <= buffer.byteLength) {
      const typoAsc = view.getInt16(os2Offset + 68);
      const typoDesc = view.getInt16(os2Offset + 70);
      cellHeight = Math.abs(typoAsc) + Math.abs(typoDesc);
    }
    if (cellHeight === 0 && hheaOffset && hheaOffset + 8 <= buffer.byteLength) {
      const asc = view.getInt16(hheaOffset + 4);
      const desc = view.getInt16(hheaOffset + 6);
      cellHeight = Math.abs(asc) + Math.abs(desc);
    }

    const ratio = cellHeight > 0 && unitsPerEm > 0 ? unitsPerEm / cellHeight : 1;

    // Name records of the Windows platform are UTF-16BE: nameID 1 family, 4 full, 6 PostScript
    const names: string[] = [];
    if (nameOffset && nameOffset + 6 <= buffer.byteLength) {
      const count = view.getUint16(nameOffset + 2);
      const strings = nameOffset + view.getUint16(nameOffset + 4);
      for (let i = 0; i < count; i++) {
        const record = nameOffset + 6 + i * 12;
        if (record + 12 > buffer.byteLength) break;
        const nameId = view.getUint16(record + 6);
        if (view.getUint16(record) !== 3 || (nameId !== 1 && nameId !== 4 && nameId !== 6)) {
          continue;
        }
        const length = view.getUint16(record + 8);
        const start = strings + view.getUint16(record + 10);
        if (start + length > buffer.byteLength) continue;
        let name = '';
        for (let j = 0; j + 1 < length; j += 2) {
          name += String.fromCharCode(view.getUint16(start + j));
        }
        name = name.trim();
        if (name && !names.some((n) => n.toLowerCase() === name.toLowerCase())) names.push(name);
      }
    }

    return { unitsPerEm, winAscent, winDescent, ratio, names };
  } catch {
    return unknown;
  }
}
