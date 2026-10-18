import {
  type Tag,
  type Char,
  type DrawingInstruction,
  CHARKIND,
  FadeAnimation,
  FadeKind
} from './types';
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

/**
 * Outline of an ASS drawing in output pixels. Each `m` closes the contour before it, as libass
 * does, so fill and border both see closed shapes. Coordinates keep their script values, negative
 * ones included: the origin is the pen position, not the bounding box.
 * `n` (move without closing) is not handled, since ass-compiler turns it into a line.
 */
export function buildDrawingPath(
  instructions: DrawingInstruction[],
  sx: number,
  sy: number
): Path2D {
  const path = new Path2D();
  let open = false;

  instructions.forEach(({ type, points }) => {
    if (type === 'M' && open) path.closePath();

    if (type === 'C') {
      // Curves come in triples. A trailing partial triple is ignored, as SVG does.
      for (let i = 0; i + 2 < points.length; i += 3) {
        const p1 = points[i]!;
        const p2 = points[i + 1]!;
        const p3 = points[i + 2]!;
        path.bezierCurveTo(p1.x * sx, p1.y * sy, p2.x * sx, p2.y * sy, p3.x * sx, p3.y * sy);
      }
    } else {
      points.forEach(({ x, y }, i) => {
        if (type === 'M' && i === 0) path.moveTo(x * sx, y * sy);
        else path.lineTo(x * sx, y * sy);
      });
    }
    open = true;
  });

  if (open) path.closePath();
  return path;
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

function checkMaskSize(mask: Uint8ClampedArray, width: number, height: number) {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 0 ||
    height < 0 ||
    mask.length !== width * height
  ) {
    throw new RangeError('Invalid mask dimensions');
  }
}

function maskRadius(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

// A sampled Gaussian, not libass's integer cascade. Transparent samples outside the ROI
// retain their weight: clipping the image must not renormalize the blur at its edges.
function gaussianMaskAxis(
  source: Float32Array,
  width: number,
  height: number,
  sigma: number,
  vertical: boolean
) {
  const extent = vertical ? height : width;
  if (!sigma || extent === 0) return source;
  const support = Math.ceil(4 * sigma);
  const radius = Math.min(support, extent - 1);
  const kernel = new Float64Array(radius + 1);
  let total = 0;
  // For a large sigma, the continuous normalization avoids an unbounded kernel allocation.
  // At sigma >= 32 the discretization error here is below the 8-bit mask precision.
  if (sigma >= 32) total = Math.sqrt(2 * Math.PI) * sigma;
  for (let i = 0; i <= (sigma >= 32 ? radius : support); i++) {
    const weight = Math.exp(-0.5 * (i / sigma) ** 2);
    if (i <= radius) kernel[i] = weight;
    if (sigma < 32) total += i === 0 ? weight : 2 * weight;
  }
  for (let i = 0; i <= radius; i++) kernel[i] = kernel[i]! / total;

  // Only the covered span of each row is read: most of a padded mask is transparent.
  const first = new Int32Array(height).fill(-1);
  const last = new Int32Array(height);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (!source[row + x]) continue;
      if (first[y] === -1) first[y] = x;
      last[y] = x;
    }
  }
  const result = new Float32Array(source.length);
  // The kernel is symmetric: the two samples at the same distance share one multiplication.
  if (vertical) {
    // Whole rows are added at a time, so memory is read in order.
    const sum = new Float64Array(width);
    for (let y = 0; y < height; y++) {
      let covered = false;
      for (let i = 0; i <= radius; i++) {
        const above = y - i >= 0 && first[y - i] !== -1 ? y - i : -1;
        const below = i && y + i < height && first[y + i] !== -1 ? y + i : -1;
        if (above === -1 && below === -1) continue;
        if (!covered) sum.fill(0);
        covered = true;
        const weight = kernel[i]!;
        if (above !== -1 && below !== -1) {
          const rowA = above * width;
          const rowB = below * width;
          const to = Math.max(last[above]!, last[below]!);
          for (let x = Math.min(first[above]!, first[below]!); x <= to; x++) {
            sum[x] = sum[x]! + (source[rowA + x]! + source[rowB + x]!) * weight;
          }
        } else {
          const from = above !== -1 ? above : below;
          const row = from * width;
          for (let x = first[from]!; x <= last[from]!; x++) {
            sum[x] = sum[x]! + source[row + x]! * weight;
          }
        }
      }
      if (covered) result.set(sum, y * width);
    }
    return result;
  }
  for (let y = 0; y < height; y++) {
    const start = first[y]!;
    if (start === -1) continue;
    const end = last[y]!;
    const row = y * width;
    for (let x = Math.max(0, start - radius); x <= Math.min(width - 1, end + radius); x++) {
      const from = Math.max(start, x - radius);
      const to = Math.min(end, x + radius);
      let value = 0;
      if (from === x - radius && to === x + radius) {
        value = source[row + x]! * kernel[0]!;
        for (let i = 1; i <= radius; i++) {
          value += (source[row + x - i]! + source[row + x + i]!) * kernel[i]!;
        }
      } else {
        for (let i = from; i <= to; i++) value += source[row + i]! * kernel[x > i ? x - i : i - x]!;
      }
      result[row + x] = value;
    }
  }
  return result;
}

// Keep the horizontal sums at full precision; libass truncates only after the 2D /16.
function beMaskPass(
  mask: Uint8ClampedArray,
  width: number,
  height: number,
  horizontal: Uint16Array
) {
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      horizontal[row + x] =
        (x > 0 ? mask[row + x - 1]! : 0) +
        2 * mask[row + x]! +
        (x + 1 < width ? mask[row + x + 1]! : 0);
    }
  }
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      mask[row + x] =
        ((y > 0 ? horizontal[row + x - width]! : 0) +
          2 * horizontal[row + x]! +
          (y + 1 < height ? horizontal[row + x + width]! : 0)) >>
        4;
    }
  }
}

/**
 * Blur alpha coverage before tinting. Gaussian X/Y are independent; ASS edge blur follows
 * as discrete [1,2,1] passes, including libass's 6-bit intermediate rounding for be > 1.
 * The caller supplies transparent padding. Dimensions stay fixed and the input is not changed.
 */
export function blurMask(
  mask: Uint8ClampedArray,
  width: number,
  height: number,
  sigmaX: number,
  sigmaY: number,
  be: number
): Uint8ClampedArray {
  checkMaskSize(mask, width, height);
  const result = mask.slice();
  if (maskRadius(sigmaX) || maskRadius(sigmaY)) {
    let values: Float32Array = new Float32Array(mask);
    values = gaussianMaskAxis(values, width, height, maskRadius(sigmaX), false);
    values = gaussianMaskAxis(values, width, height, maskRadius(sigmaY), true);
    for (let i = 0; i < values.length; i++) result[i] = Math.round(values[i]!);
  }
  const passes = Math.min(127, Math.floor(maskRadius(be) + 0.5));
  if (passes && result.length) {
    const horizontal = new Uint16Array(result.length);
    if (passes > 1) {
      for (let i = 0; i < result.length; i++) result[i] = ((result[i]! >> 1) + 1) >> 1;
      for (let i = 1; i < passes; i++) beMaskPass(result, width, height, horizontal);
      for (let i = 0; i < result.length; i++) {
        const value = result[i]!;
        result[i] = (value << 2) - (value > 32 ? 1 : 0);
      }
    }
    beMaskPass(result, width, height, horizontal);
  }
  return result;
}

/**
 * Coverage of an RGBA raster that was drawn `factorX` and `factorY` times larger than `width` x
 * `height`: the alpha averaged over each block, which is the area coverage at the smaller size.
 */
export function reduceAlpha(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  factorX: number,
  factorY = factorX
): Uint8ClampedArray {
  if (
    !Number.isSafeInteger(factorX) ||
    !Number.isSafeInteger(factorY) ||
    factorX < 1 ||
    factorY < 1 ||
    rgba.length !== width * height * factorX * factorY * 4
  ) {
    throw new RangeError('Invalid raster dimensions');
  }
  const result = new Uint8ClampedArray(width * height);
  const area = factorX * factorY;
  if (area === 1) {
    for (let i = 0; i < result.length; i++) result[i] = rgba[i * 4 + 3]!;
    return result;
  }
  const sums = new Uint32Array(width);
  for (let y = 0; y < height; y++) {
    sums.fill(0);
    for (let row = y * factorY; row < (y + 1) * factorY; row++) {
      let i = row * width * factorX * 4 + 3;
      if (factorX === 1) {
        for (let x = 0; x < width; x++, i += 4) sums[x] = sums[x]! + rgba[i]!;
        continue;
      }
      for (let x = 0; x < width; x++) {
        let sum = 0;
        for (let k = 0; k < factorX; k++, i += 4) sum += rgba[i]!;
        sums[x] = sums[x]! + sum;
      }
    }
    for (let x = 0; x < width; x++) result[y * width + x] = Math.round(sums[x]! / area);
  }
  return result;
}

/**
 * Halve 2x supersampled coverage with an exact 2x2 box filter: each output pixel gets the area
 * coverage of its own four samples, so edges stay as sharp as a direct rasterization.
 * Output pixel (x, y) reads the block at (left + 2x, top + 2y); samples outside the mask are
 * transparent.
 */
export function halveMask(
  mask: Uint8ClampedArray,
  width: number,
  height: number,
  left: number,
  top: number,
  outWidth: number,
  outHeight: number
): Uint8ClampedArray {
  checkMaskSize(mask, width, height);
  const result = new Uint8ClampedArray(outWidth * outHeight);
  const fromX = Math.max(0, Math.ceil((-1 - left) / 2));
  const toX = Math.min(outWidth, Math.floor((width - 1 - left) / 2) + 1);
  const fromY = Math.max(0, Math.ceil((-1 - top) / 2));
  const toY = Math.min(outHeight, Math.floor((height - 1 - top) / 2) + 1);
  for (let y = fromY; y < toY; y++) {
    const row = top + 2 * y;
    const upper = row >= 0 ? row * width : -1;
    const lower = row + 1 < height ? (row + 1) * width : -1;
    for (let x = fromX; x < toX; x++) {
      const col = left + 2 * x;
      let sum = 0;
      if (col >= 0) {
        if (upper >= 0) sum += mask[upper + col]!;
        if (lower >= 0) sum += mask[lower + col]!;
      }
      if (col + 1 < width) {
        if (upper >= 0) sum += mask[upper + col + 1]!;
        if (lower >= 0) sum += mask[lower + col + 1]!;
      }
      result[y * outWidth + x] = (sum + 2) >> 2;
    }
  }
  return result;
}

/**
 * Copy a mask into a larger one with its top left corner at (left, top) of the target. Whatever
 * falls outside the target is dropped.
 */
export function placeMask(
  source: Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  target: Uint8ClampedArray,
  targetWidth: number,
  targetHeight: number,
  left: number,
  top: number
) {
  checkMaskSize(source, sourceWidth, sourceHeight);
  checkMaskSize(target, targetWidth, targetHeight);
  const fromX = Math.max(0, -left);
  const toX = Math.min(sourceWidth, targetWidth - left);
  if (fromX >= toX) return;
  for (let y = Math.max(0, -top); y < Math.min(sourceHeight, targetHeight - top); y++) {
    const row = y * sourceWidth;
    target.set(source.subarray(row + fromX, row + toX), (y + top) * targetWidth + left + fromX);
  }
}

/**
 * Dilate alpha coverage with an elliptical, subpixel footprint. Fractional shifts interpolate
 * coverage instead of rounding a small bold radius to zero. Scanlines sample the ellipse at
 * most half a pixel apart; this is a bitmap approximation, not a font outline stroker.
 * Work stays inside the supplied ROI, which must include the desired transparent padding.
 */
export function expandMask(
  mask: Uint8ClampedArray,
  width: number,
  height: number,
  rx: number,
  ry: number
): Uint8ClampedArray {
  checkMaskSize(mask, width, height);
  rx = maskRadius(rx);
  ry = maskRadius(ry);
  const result = mask.slice();
  if (!result.length || (!rx && !ry)) return result;

  const rows = new Set<number>([0]);
  const limit = Math.min(ry, height);
  const step = ry <= 1 ? 0.25 : 0.5;
  for (let y = step; y < limit; y += step) {
    rows.add(y);
    rows.add(-y);
  }
  for (const y of [limit, Math.min(ry / Math.SQRT2, limit)]) {
    rows.add(y);
    rows.add(-y);
  }

  const line = new Float32Array(width);
  const deque = new Int32Array(width);
  for (const dy of rows) {
    const radius = ry ? rx * Math.sqrt(Math.max(0, 1 - (dy / ry) ** 2)) : rx;
    const whole = Math.floor(Math.min(radius, width));
    const fraction = radius - Math.floor(radius);
    for (let y = 0; y < height; y++) {
      const sourceY = y + dy;
      const top = Math.floor(sourceY);
      const fractionY = sourceY - top;
      const topRow = top >= 0 && top < height ? top * width : -1;
      const bottomRow = top + 1 >= 0 && top + 1 < height ? (top + 1) * width : -1;
      if (topRow < 0 && bottomRow < 0) continue;
      for (let x = 0; x < width; x++) {
        line[x] =
          (topRow >= 0 ? mask[topRow + x]! * (1 - fractionY) : 0) +
          (bottomRow >= 0 ? mask[bottomRow + x]! * fractionY : 0);
      }

      let head = 0;
      let tail = 0;
      let next = 0;
      for (let x = 0; x < width; x++) {
        const end = Math.min(width - 1, x + whole);
        while (next <= end) {
          while (tail > head && line[deque[tail - 1]!]! <= line[next]!) tail--;
          deque[tail++] = next++;
        }
        while (tail > head && deque[head]! < x - whole) head++;
        let value = tail > head ? line[deque[head]!]! : 0;
        if (fraction && radius < width) {
          const left = x - whole;
          const right = x + whole;
          const a =
            (left >= 0 ? line[left]! * (1 - fraction) : 0) +
            (left > 0 ? line[left - 1]! * fraction : 0);
          const b =
            (right < width ? line[right]! * (1 - fraction) : 0) +
            (right + 1 < width ? line[right + 1]! * fraction : 0);
          value = Math.max(value, a, b);
        }
        const index = y * width + x;
        result[index] = Math.max(result[index]!, Math.round(value));
      }
    }
  }
  return result;
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

/** Row-major homography, applied to a column vector [x, y, 1]. */
export type ProjectionMatrix = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number
];

export type ProjectionTransform = {
  frx?: number;
  fry?: number;
  frz?: number;
  fax?: number;
  fay?: number;
  /** The pen's X and the top of the unrotated line box, for glyph-local shear. */
  shearOrigin?: { x: number; y: number };
};

/**
 * Projects already scaled screen coordinates around an ASS event's rotation origin. As in
 * libass's calc_transform_matrix, shear precedes rotations Z, X and Y, then perspective.
 * The caller supplies the focal length in output pixels (312.5 times the vertical layout scale)
 * and adjusts fax/fay for unequal X/Y glyph scales. Font scaling belongs to the input mask.
 */
export function assProjection(
  origin: { x: number; y: number },
  transform: ProjectionTransform,
  focalLength: number
): ProjectionMatrix {
  if (!(focalLength > 0) || !Number.isFinite(focalLength)) {
    throw new RangeError('The projection focal length must be finite and positive');
  }

  type Row = [number, number, number];
  const combine = (a: Row, ka: number, b: Row, kb: number): Row => [
    a[0] * ka + b[0] * kb,
    a[1] * ka + b[1] * kb,
    a[2] * ka + b[2] * kb
  ];
  const radians = Math.PI / 180;
  const rx = (transform.frx ?? 0) * radians;
  const ry = (transform.fry ?? 0) * radians;
  const rz = (transform.frz ?? 0) * radians;
  const fax = transform.fax ?? 0;
  const fay = transform.fay ?? 0;
  const shearOrigin = transform.shearOrigin ?? origin;
  const x: Row = [1, fax, -origin.x - fax * shearOrigin.y];
  const y: Row = [fay, 1, -origin.y - fay * shearOrigin.x];
  const zero: Row = [0, 0, 0];

  const xz = combine(x, Math.cos(rz), y, Math.sin(rz));
  const yz = combine(x, -Math.sin(rz), y, Math.cos(rz));
  const yx = combine(yz, Math.cos(rx), zero, 0);
  const zx = combine(yz, -Math.sin(rx), zero, 0);
  const xy = combine(xz, Math.cos(ry), zx, -Math.sin(ry));
  const zy = combine(xz, Math.sin(ry), zx, Math.cos(ry));
  const w: Row = [zy[0] / focalLength, zy[1] / focalLength, 1 + zy[2] / focalLength];
  const outX = combine(xy, 1, w, origin.x);
  const outY = combine(yx, 1, w, origin.y);

  return [...outX, ...outY, ...w];
}

/** A point behind the eye plane or too close to its singularity has no finite image. */
export function projectPoint(
  matrix: ProjectionMatrix,
  x: number,
  y: number
): { x: number; y: number } | null {
  const w = matrix[6] * x + matrix[7] * y + matrix[8];
  if (!Number.isFinite(w) || w <= 1e-8) return null;
  const px = (matrix[0] * x + matrix[1] * y + matrix[2]) / w;
  const py = (matrix[3] * x + matrix[4] * y + matrix[5]) / w;
  return Number.isFinite(px) && Number.isFinite(py) ? { x: px, y: py } : null;
}

/** Inverse mapping for sampling a projected mask; a collapsed plane cannot be sampled. */
export function invertProjection(matrix: ProjectionMatrix): ProjectionMatrix | null {
  const [a, b, c, d, e, f, g, h, i] = matrix;
  const aa = e * i - f * h;
  const bb = c * h - b * i;
  const cc = b * f - c * e;
  const dd = f * g - d * i;
  const ee = a * i - c * g;
  const ff = c * d - a * f;
  const gg = d * h - e * g;
  const hh = b * g - a * h;
  const ii = a * e - b * d;
  const determinant = a * aa + b * dd + c * gg;
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) return null;
  const result: ProjectionMatrix = [
    aa / determinant,
    bb / determinant,
    cc / determinant,
    dd / determinant,
    ee / determinant,
    ff / determinant,
    gg / determinant,
    hh / determinant,
    ii / determinant
  ];
  return result.every(Number.isFinite) ? result : null;
}

/**
 * Weight asked by a `\b` value or a style's Bold field, as libass reads it: 1 and -1 are bold
 * (700), 0 and below are normal (400), anything else is an exact weight.
 */
export function assWeight(b: number): number {
  if (b === 1 || b === -1) return 700;
  if (b <= 0) return 400;
  return b;
}

/**
 * Weights of a `FontFace` weight descriptor: `normal`, `bold`, a number, or a range such as
 * `100 900` (variable fonts). Undefined when it is missing or not understood.
 */
export function parseFontWeight(weight?: string): [number, number] | undefined {
  if (weight === undefined) return undefined;
  const parts = weight
    .trim()
    .split(/\s+/)
    .map((w) => (w === 'normal' ? 400 : w === 'bold' ? 700 : Number(w)));
  const min = parts[0];
  const max = parts[1] ?? min;
  if (min === undefined || max === undefined || parts.length > 2) return undefined;
  if (!(min > 0) || !(max >= min)) return undefined;
  return [min, max];
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
  /** OS/2 usWeightClass, read as libass does (ass_face_get_weight) */
  weight: number;
  /** false when the file has neither OS/2 nor head: `weight` is then a guess */
  weightKnown: boolean;
  /** bold flag of the face, from fsSelection or macStyle */
  bold: boolean;
  italic: boolean;
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
 * Also reads the weight, slant and names of the face. WOFF, WOFF2 and font collections are not
 * read: they give the defaults (ratio 1, weight 400 but not known, no names).
 */
export function parseFontMetrics(buffer: ArrayBuffer): FontMetrics {
  const unknown: FontMetrics = {
    unitsPerEm: 1000,
    winAscent: 0,
    winDescent: 0,
    ratio: 1,
    weight: 400,
    weightKnown: false,
    bold: false,
    italic: false,
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

    // Bold and italic flags come from OS/2 fsSelection, or head macStyle without OS/2, as in
    // FreeType. A weight class of 0 falls back to the bold flag, 1 to 9 are legacy values.
    const hasHead = !!headOffset && headOffset + 46 <= buffer.byteLength;
    const macStyle = hasHead ? view.getUint16(headOffset + 44) : 0;
    const hasOs2 = !!os2Offset && os2Offset + 64 <= buffer.byteLength;
    const fsSelection = hasOs2 ? view.getUint16(os2Offset + 62) : 0;
    const boldFlag = hasOs2 ? (fsSelection & 0x20) !== 0 : (macStyle & 1) !== 0;
    const italic = hasOs2 ? (fsSelection & 0x201) !== 0 : (macStyle & 2) !== 0;
    const weightClass = hasOs2 ? view.getUint16(os2Offset + 4) : 0;
    let weight = weightClass;
    if (weightClass === 0) weight = boldFlag ? 700 : 400;
    else if (weightClass < 10) {
      weight = [100, 200, 300, 350, 400, 600, 800, 900, 950][weightClass - 1] as number;
    }

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

    return {
      unitsPerEm,
      winAscent,
      winDescent,
      ratio,
      weight,
      weightKnown: hasOs2 || hasHead,
      bold: boldFlag,
      italic,
      names
    };
  } catch {
    return unknown;
  }
}
