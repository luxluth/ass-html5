import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import ASS from '../src/ass';
import { buildDrawingPath } from '../src/utils';
import { CHARKIND } from '../src/types';

// jsdom has no Path2D: record the calls so the outline can be checked.
class RecordingPath2D {
  calls: unknown[][] = [];
  moveTo(x: number, y: number) {
    this.calls.push(['moveTo', x, y]);
  }
  lineTo(x: number, y: number) {
    this.calls.push(['lineTo', x, y]);
  }
  bezierCurveTo(...args: number[]) {
    this.calls.push(['bezierCurveTo', ...args]);
  }
  closePath() {
    this.calls.push(['closePath']);
  }
}

// A drawing with a bounding box of -38,-112 and 46x112, at pos(566,46)
const drawingScript = (alignment: number) => `[Script Info]
Title: Drawing Layout
PlayResX: 1280
PlayResY: 720
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,2,2,10,10,10,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\an${alignment}\\pos(566,46)\\fscx125\\fscy125\\p1}m -38 -112 l 8 -112 8 0 -38 0`;

function script(events: string[]) {
  return `[Script Info]
PlayResX: 1280
PlayResY: 720
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,50,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,10,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events.join('\n')}`;
}

describe('Layout', () => {
  let videoElement: HTMLVideoElement;

  beforeEach(() => {
    videoElement = document.createElement('video');
    Object.defineProperty(videoElement, 'videoWidth', { value: 1280 });
    Object.defineProperty(videoElement, 'videoHeight', { value: 720 });
    Object.defineProperty(videoElement, 'clientWidth', { value: 1280 });
    Object.defineProperty(videoElement, 'clientHeight', { value: 720 });
    document.body.appendChild(videoElement);

    global.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function setup(events: string[]) {
    const ass = new ASS({ assText: script(events), video: videoElement });
    await ass.render();
    return { ass, renderer: (ass as any).renderer };
  }

  it('should resolve the style of a fragment once per frame', async () => {
    const { ass, renderer } = await setup([
      'Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,Hello world'
    ]);
    const computeStyle = vi.spyOn(renderer, 'computeStyle');
    renderer.display(0.5);

    // One for the dialogue, one for its only fragment
    expect(computeStyle).toHaveBeenCalledTimes(2);
    ass.destroy();
  });

  it('should measure a run once while the canvas stays the same', async () => {
    const line = 'Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,Hello world';
    const once = await setup([line]);
    const measureOnce = vi.spyOn(once.renderer.layers[0].ctx, 'measureText');
    once.renderer.display(0.5);
    once.ass.destroy();

    const twice = await setup([line, line]);
    const measureTwice = vi.spyOn(twice.renderer.layers[0].ctx, 'measureText');
    twice.renderer.display(0.5);
    twice.ass.destroy();

    expect(measureOnce).toHaveBeenCalled();
    expect(measureTwice).toHaveBeenCalledTimes(measureOnce.mock.calls.length);
  });

  // Canvas bounds of the fill and border of every word painted, from their masks
  function recordMasks(renderer: any) {
    const masks: Record<'fill' | 'border', { left: number; width: number }>[] = [];
    const bounds = (bitmap: {
      data: Uint8ClampedArray;
      width: number;
      height: number;
      x: number;
    }) => {
      let left = bitmap.width;
      let right = -1;
      bitmap.data.forEach((value, i) => {
        if (value < 128) return;
        left = Math.min(left, i % bitmap.width);
        right = Math.max(right, i % bitmap.width);
      });
      return { left: bitmap.x + left, width: right - left + 1 };
    };
    const drawWord = renderer.drawWord.bind(renderer);
    vi.spyOn(renderer, 'drawWord').mockImplementation((...args: any[]) => {
      const result = drawWord(...args);
      if (result) {
        masks.push({ fill: bounds(result.fill), border: result.border && bounds(result.border) });
      }
      return result;
    });
    return masks;
  }

  it('should place a run after a scaled run at its scaled width', async () => {
    const { ass, renderer } = await setup([
      'Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,{\\an7\\pos(100,100)\\bord0\\fscx50}AA{\\fscx100}AA'
    ]);
    const masks = recordMasks(renderer);
    renderer.display(0.5);

    const chars = renderer.ppass[0].chars;
    const naturalWidth = chars[2].w + chars[3].w;
    expect(chars[2].pos.x).toBeCloseTo(100 + naturalWidth / 2);

    // Painted where the layout put them, each run at its own scale
    const [half, full] = masks as [(typeof masks)[0], (typeof masks)[0]];
    expect(Math.abs(half.fill.left - 100)).toBeLessThanOrEqual(2);
    expect(Math.abs(full.fill.left - (100 + naturalWidth / 2))).toBeLessThanOrEqual(2);
    expect(half.fill.width / full.fill.width).toBeCloseTo(0.5, 1);
    ass.destroy();
  });

  it('should make a line taller with \\fscy', async () => {
    const { ass, renderer } = await setup([
      'Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,{\\an7\\pos(100,100)}A',
      'Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,{\\an7\\pos(300,100)\\fscy200}A'
    ]);
    // node-canvas has no font ascent, so every glyph gets a 40 px one
    vi.spyOn(renderer.layers[0].ctx, 'measureText').mockImplementation(
      () => ({ width: 30, fontBoundingBoxAscent: 40, fontBoundingBoxDescent: 10 }) as TextMetrics
    );
    renderer.invalidate();
    renderer.display(0.5);

    const heads = renderer.ppass.map((d: any) => d.chars[0]);
    const plain = heads.find((c: any) => c.pos.x < 200);
    const tall = heads.find((c: any) => c.pos.x > 200);
    // The baseline sits one ascent below the top of the line
    expect(plain.pos.y).toBeCloseTo(140);
    expect(tall.pos.y).toBeCloseTo(180);
    ass.destroy();
  });

  it('should keep the border width when the text is scaled', async () => {
    const { ass, renderer } = await setup([
      'Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,{\\fscx200\\fscy200}Hi'
    ]);
    const masks = recordMasks(renderer);
    renderer.display(0.5);

    // \bord2 grows the text by 2 px on each side at PlayRes 1280x720, whatever the scale
    const { fill, border } = masks[0]!;
    expect(Math.abs(border.width - fill.width - 4)).toBeLessThanOrEqual(1);
    ass.destroy();
  });
});

describe('Drawing outlines', () => {
  beforeEach(() => {
    vi.stubGlobal('Path2D', RecordingPath2D);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should close each contour before the next m and at the end', () => {
    const path = buildDrawingPath(
      [
        { type: 'M', points: [{ x: 0, y: 0 }] },
        {
          type: 'L',
          points: [
            { x: 10, y: 0 },
            { x: 10, y: 10 }
          ]
        },
        { type: 'M', points: [{ x: 20, y: 20 }] },
        {
          type: 'L',
          points: [
            { x: 30, y: 20 },
            { x: 30, y: 30 }
          ]
        }
      ],
      1,
      1
    ) as unknown as RecordingPath2D;

    expect(path.calls).toEqual([
      ['moveTo', 0, 0],
      ['lineTo', 10, 0],
      ['lineTo', 10, 10],
      ['closePath'],
      ['moveTo', 20, 20],
      ['lineTo', 30, 20],
      ['lineTo', 30, 30],
      ['closePath']
    ]);
  });

  it('should keep negative script coordinates and only scale them', () => {
    const path = buildDrawingPath(
      [
        { type: 'M', points: [{ x: -38, y: -112 }] },
        { type: 'L', points: [{ x: 8, y: -112 }] }
      ],
      1.25,
      1.25
    ) as unknown as RecordingPath2D;

    expect(path.calls[0]).toEqual(['moveTo', -47.5, -140]);
  });
});

describe('Drawing layout', () => {
  let videoElement: HTMLVideoElement;
  let fill: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubGlobal('Path2D', RecordingPath2D);

    // The outline cannot go through a real canvas in jsdom, so painting is recorded instead.
    const proto = (document.createElement('canvas').getContext('2d') as any).constructor.prototype;
    fill = vi.spyOn(proto, 'fill').mockImplementation(() => {});
    vi.spyOn(proto, 'stroke').mockImplementation(() => {});

    videoElement = document.createElement('video');
    Object.defineProperty(videoElement, 'videoWidth', { value: 1280 });
    Object.defineProperty(videoElement, 'videoHeight', { value: 720 });
    Object.defineProperty(videoElement, 'clientWidth', { value: 1280 });
    Object.defineProperty(videoElement, 'clientHeight', { value: 720 });
    document.body.appendChild(videoElement);

    global.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('should paint a drawing at its pen position with its script coordinates', async () => {
    const ass = new ASS({ assText: drawingScript(7), video: videoElement });
    await ass.render();
    const renderer = (ass as any).renderer;
    renderer.display(1);

    const drawing = renderer.ppass[0].chars.find((c: any) => c.kind === CHARKIND.DRAWING);
    expect(drawing.pos.x).toBeCloseTo(566);
    expect(drawing.pos.y).toBeCloseTo(46);
    expect(drawing.w).toBeCloseTo(46 * 1.25);

    const outline = fill.mock.calls[0]![0] as unknown as RecordingPath2D;
    expect(outline.calls[0]).toEqual(['moveTo', -47.5, -140]);
    ass.destroy();
  });

  it('should lay out a drawing at the size it is painted, \\fscx included', async () => {
    const ass = new ASS({ assText: drawingScript(8), video: videoElement });
    await ass.render();
    const renderer = (ass as any).renderer;
    const drawing = renderer.ppass[0].chars.find((c: any) => c.kind === CHARKIND.DRAWING);

    drawing.w = 12345; // a width left from an earlier frame must not move the drawing
    renderer.display(1);

    // Centered on the anchor: offset by half of the painted width (57.5)
    expect(drawing.pos.x).toBeCloseTo(566 - (46 * 1.25) / 2);
    ass.destroy();
  });
});

// Text centered (\an5) on pos(640,360), the center of the canvas
const textScript = (tags: string, text = 'TEST', position = '\\pos(640,360)') => `[Script Info]
Title: Text Layout
PlayResX: 1280
PlayResY: 720
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,50,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,5,10,10,10,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\an5${position}${tags}}${text}`;

// Follow the real raster transform through its reduction to the padded bitmap (`supersample`
// pixels per output pixel) and the final homography. This checks the device position
// independently of the layout's stored pen and already scaled advance.
function mappedAdvanceCenter(
  fill: any,
  glyph: any,
  source: any,
  matrix: readonly number[],
  supersample: number
) {
  const pad = (source.width - glyph.width) / 2;
  const factorX = fill.raster.width / glyph.width;
  const factorY = fill.raster.height / glyph.height;
  const center = fill.x + fill.width / 2;
  const rasterX = fill.matrix.a * center + fill.matrix.c * fill.y + fill.matrix.e;
  const rasterY = fill.matrix.b * center + fill.matrix.d * fill.y + fill.matrix.f;
  const x = source.x + (rasterX / factorX + pad) / supersample;
  const y = source.y + (rasterY / factorY + pad) / supersample;
  const w = matrix[6]! * x + matrix[7]! * y + matrix[8]!;
  return {
    x: (matrix[0]! * x + matrix[1]! * y + matrix[2]!) / w,
    y: (matrix[3]! * x + matrix[4]! * y + matrix[5]!) / w
  };
}

describe('Painting', () => {
  let videoElement: HTMLVideoElement;

  beforeEach(() => {
    videoElement = document.createElement('video');
    Object.defineProperty(videoElement, 'videoWidth', { value: 1280 });
    Object.defineProperty(videoElement, 'videoHeight', { value: 720 });
    Object.defineProperty(videoElement, 'clientWidth', { value: 1280 });
    Object.defineProperty(videoElement, 'clientHeight', { value: 720 });
    document.body.appendChild(videoElement);

    global.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should keep the rendered advance centered at pos when the text grows', async () => {
    const proto = (document.createElement('canvas').getContext('2d') as any).constructor.prototype;
    const original = proto.fillText;
    let fillCall: any;
    vi.spyOn(proto, 'fillText').mockImplementation(function (
      this: CanvasRenderingContext2D,
      ...args: any[]
    ) {
      const [text, x, y] = args;
      const transform = this.getTransform();
      this.setTransform(1, 0, 0, 1, 0, 0);
      const measuredWidth = this.measureText(text).width;
      this.setTransform(transform);
      fillCall = {
        x,
        y,
        width: measuredWidth,
        matrix: transform
      };
      return original.apply(this, args);
    });
    // The part of the scratch surface that is read back is the raster
    const read = proto.getImageData;
    vi.spyOn(proto, 'getImageData').mockImplementation(function (
      this: CanvasRenderingContext2D,
      ...args: any[]
    ) {
      if (fillCall && !fillCall.raster) fillCall.raster = { width: args[2], height: args[3] };
      return read.apply(this, args);
    });

    for (const scale of [100, 110, 200]) {
      const ass = new ASS({ assText: textScript(`\\fscx${scale}\\fscy100`), video: videoElement });
      await ass.render();
      const renderer = (ass as any).renderer;
      const glyph = vi.spyOn(renderer, 'glyphBitmap');
      const projection = vi.spyOn(renderer, 'projectBitmap');
      renderer.forceRender(1);

      expect(fillCall.width).toBeGreaterThan(0);
      const [source, , matrix, , , supersample] = projection.mock.calls[0]! as any[];
      const center = mappedAdvanceCenter(
        fillCall,
        glyph.mock.results[0]!.value,
        source,
        matrix,
        supersample
      );
      // Like libass, the pen is placed to 1/8 pixel
      expect(Math.abs(center.x - 640)).toBeLessThanOrEqual(1 / 16);
      ass.destroy();
    }
  });

  it('should keep opaque glyph pixels centered across horizontal scales', async () => {
    const centers: number[] = [];
    for (const scale of [100, 110, 200]) {
      const ass = new ASS({ assText: textScript(`\\fscx${scale}`, 'H'), video: videoElement });
      await ass.render();
      const renderer = (ass as any).renderer;
      renderer.forceRender(1);
      const { canvas, ctx } = renderer.layers[0];
      const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let left = canvas.width;
      let right = -1;
      for (let i = 0; i < rgba.length; i += 4) {
        if (rgba[i + 3] > 128) {
          const x = (i / 4) % canvas.width;
          left = Math.min(left, x);
          right = Math.max(right, x);
        }
      }
      expect(right).toBeGreaterThan(left);
      centers.push((left + right + 1) / 2);
      ass.destroy();
    }
    expect(Math.max(...centers) - Math.min(...centers)).toBeLessThanOrEqual(1);
    for (const center of centers) expect(Math.abs(center - 640)).toBeLessThanOrEqual(1);
  });

  it('should keep the font size, baseline and advance independent of X and Y rotations', async () => {
    const metrics: { x: number; y: number; width: number; fontsize: number }[] = [];
    for (const rotation of ['', '\\frx45', '\\fry60', '\\frx-125\\fry30']) {
      const ass = new ASS({ assText: textScript(rotation), video: videoElement });
      await ass.render();
      const renderer = (ass as any).renderer;
      const glyph = vi.spyOn(renderer, 'glyphBitmap');
      renderer.forceRender(1);
      const word = glyph.mock.calls[0]![0] as any;
      metrics.push({
        x: word.value[0].pos.x,
        y: word.value[0].pos.y,
        width: word.w,
        fontsize: word.font.fontsize
      });
      ass.destroy();
    }
    for (const value of metrics.slice(1)) expect(value).toEqual(metrics[0]);
  });

  it('should keep an explicit rotation origin fixed while the text moves', async () => {
    const ass = new ASS({
      assText: textScript('\\org(600,360)\\frz90', 'TEST', '\\move(640,360,680,360)'),
      video: videoElement
    });
    await ass.render();
    const renderer = (ass as any).renderer;
    const projection = vi.spyOn(renderer, 'projectBitmap');
    for (const time of [1, 4]) {
      renderer.forceRender(time);
      const matrix = projection.mock.calls.at(-1)![2] as readonly number[];
      const w = matrix[6]! * 600 + matrix[7]! * 360 + matrix[8]!;
      expect((matrix[0]! * 600 + matrix[1]! * 360 + matrix[2]!) / w).toBeCloseTo(600);
      expect((matrix[3]! * 600 + matrix[4]! * 360 + matrix[5]!) / w).toBeCloseTo(360);
    }
    ass.destroy();
  });
});
