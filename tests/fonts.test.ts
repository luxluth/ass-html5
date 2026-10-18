import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import ASS from '../src/ass';
import { assWeight, parseFontMetrics, parseFontWeight } from '../src/utils';

// Smallest TrueType file parseFontMetrics reads: head, OS/2 and name tables. The cell is
// usWinAscent + usWinDescent, so the default one gives a ratio of 1.
function fontFile(weight: number, family: string, cell = 1000): ArrayBuffer {
  const records = [
    { id: 1, text: family },
    { id: 4, text: family },
    { id: 6, text: family.replace(/\s/g, '') }
  ];
  const stringsAt = 208 + 6 + records.length * 12;
  const size = records.reduce((n, r) => n + r.text.length * 2, 0);
  const buffer = new ArrayBuffer(stringsAt + size);
  const view = new DataView(buffer);

  view.setUint32(0, 0x00010000);
  view.setUint16(4, 3);
  [
    ['head', 64],
    ['OS/2', 128],
    ['name', 208]
  ].forEach(([tag, offset], i) => {
    for (let j = 0; j < 4; j++) view.setUint8(12 + i * 16 + j, (tag as string).charCodeAt(j));
    view.setUint32(12 + i * 16 + 8, offset as number);
  });

  view.setUint16(64 + 18, 1000); // unitsPerEm
  view.setUint16(128 + 4, weight); // usWeightClass
  view.setUint16(128 + 74, cell * 0.8); // usWinAscent
  view.setUint16(128 + 76, cell * 0.2); // usWinDescent

  view.setUint16(208 + 2, records.length);
  view.setUint16(208 + 4, stringsAt - 208);
  let offset = 0;
  records.forEach(({ id, text }, i) => {
    const record = 208 + 6 + i * 12;
    view.setUint16(record, 3); // Windows
    view.setUint16(record + 2, 1); // Unicode BMP
    view.setUint16(record + 4, 0x409); // en-US
    view.setUint16(record + 6, id);
    view.setUint16(record + 8, text.length * 2);
    view.setUint16(record + 10, offset);
    for (let j = 0; j < text.length; j++) {
      view.setUint16(stringsAt + offset + j * 2, text.charCodeAt(j));
    }
    offset += text.length * 2;
  });

  return buffer;
}

function script(fontname: string, events: string[]) {
  return `[Script Info]
PlayResX: 1280
PlayResY: 720
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontname},50,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,2,10,10,10,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events.join('\n')}`;
}

type Call = {
  kind: 'fill' | 'stroke';
  text: string;
  font: string;
  lineWidth: number;
  same: boolean;
};

describe('Fonts', () => {
  let videoElement: HTMLVideoElement;
  let faces: { family: string; weight?: string }[];
  let calls: Call[];
  const originalGetContext = HTMLCanvasElement.prototype.getContext;

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

    // jsdom has no FontFace
    faces = [];
    vi.stubGlobal(
      'FontFace',
      class {
        status = 'loaded';
        constructor(family: string, _source: ArrayBuffer, descriptors: FontFaceDescriptors) {
          faces.push({ family, weight: descriptors.weight });
        }
        load() {
          return Promise.resolve(this);
        }
      }
    );
    Object.defineProperty(document, 'fonts', { value: { add: vi.fn() }, configurable: true });

    calls = [];
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string) {
      const ctx = originalGetContext.apply(this, [type]) as CanvasRenderingContext2D;
      if (type === '2d') {
        const record = (kind: Call['kind'], original: Function) =>
          function (this: CanvasRenderingContext2D, ...args: any[]) {
            calls.push({
              kind,
              text: args[0],
              font: this.font,
              lineWidth: this.lineWidth,
              same: this.strokeStyle === this.fillStyle
            });
            return original.apply(this, args);
          };
        ctx.fillText = record('fill', ctx.fillText);
        ctx.strokeText = record('stroke', ctx.strokeText);
      }
      return ctx;
    } as any;
  });

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function draw(assText: string, file?: ArrayBuffer, time = 0.5) {
    if (file)
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({ arrayBuffer: async () => file }))
      );
    const ass = new ASS({
      assText,
      video: videoElement,
      fonts: file ? [{ family: 'Test Sans', url: '/test.ttf' }] : undefined
    });
    await ass.render();
    (ass as any).renderer.forceRender(time);
    ass.destroy();
  }

  const fillFont = (text: string) => calls.find((c) => c.kind === 'fill' && c.text === text)!.font;

  it('should parse font metrics from TTF tables and compute the OS/2 ratio', () => {
    const buffer = new ArrayBuffer(256);
    const view = new DataView(buffer);

    view.setUint32(0, 0x00010000);
    view.setUint16(4, 2);

    // Table 1: 'head'
    view.setUint8(12, 'h'.charCodeAt(0));
    view.setUint8(13, 'e'.charCodeAt(0));
    view.setUint8(14, 'a'.charCodeAt(0));
    view.setUint8(15, 'd'.charCodeAt(0));
    view.setUint32(20, 64);
    view.setUint32(24, 54);

    // Table 2: 'OS/2'
    view.setUint8(28, 'O'.charCodeAt(0));
    view.setUint8(29, 'S'.charCodeAt(0));
    view.setUint8(30, '/'.charCodeAt(0));
    view.setUint8(31, '2'.charCodeAt(0));
    view.setUint32(36, 128);
    view.setUint32(40, 96);

    // 'head' table: unitsPerEm at offset 18 = 2048
    view.setUint16(64 + 18, 2048);

    // 'OS/2' table: usWinAscent at offset 74 = 1800, usWinDescent at offset 76 = 500
    // total cell height = 2300. ratio = 2048 / 2300 ≈ 0.8904
    view.setUint16(128 + 74, 1800);
    view.setUint16(128 + 76, 500);

    const metrics = parseFontMetrics(buffer);
    expect(metrics.unitsPerEm).toBe(2048);
    expect(metrics.winAscent).toBe(1800);
    expect(metrics.winDescent).toBe(500);
    expect(metrics.ratio).toBeCloseTo(2048 / 2300, 4);

    const woff2 = new ArrayBuffer(64);
    new DataView(woff2).setUint32(0, 0x774f4632); // 'wOF2'
    expect(parseFontMetrics(woff2).ratio).toBe(1);
    expect(parseFontMetrics(woff2).names).toEqual([]);
  });

  it('should read the weight and the names of a font file', () => {
    const metrics = parseFontMetrics(fontFile(600, 'Test Sans Semibold'));
    expect(metrics.weight).toBe(600);
    expect(metrics.italic).toBe(false);
    expect(metrics.names).toEqual(['Test Sans Semibold', 'TestSansSemibold']);
    expect(metrics.ratio).toBe(1);
  });

  it('should read legacy weight classes and the bold flag like libass', () => {
    const file = fontFile(7, 'Test Sans');
    new DataView(file).setUint16(128 + 62, 0x20); // fsSelection: bold
    const metrics = parseFontMetrics(file);
    expect(metrics.weight).toBe(800);
    expect(metrics.bold).toBe(true);
    expect(metrics.weightKnown).toBe(true);
    expect(parseFontMetrics(fontFile(4, 'Test Sans')).weight).toBe(350);

    const woff2 = new ArrayBuffer(64);
    new DataView(woff2).setUint32(0, 0x774f4632); // 'wOF2'
    expect(parseFontMetrics(woff2).weightKnown).toBe(false);
  });

  it('should register a font file with its real weight under each of its names', async () => {
    await draw(script('Test Sans Semibold', []), fontFile(600, 'Test Sans Semibold'));
    expect(faces).toEqual([
      { family: 'Test Sans', weight: '600' },
      { family: 'Test Sans Semibold', weight: '600' },
      { family: 'TestSansSemibold', weight: '600' }
    ]);
  });

  it('should read \\b and Bold the way libass does', () => {
    expect(assWeight(0)).toBe(400);
    expect(assWeight(1)).toBe(700);
    expect(assWeight(-1)).toBe(700);
    expect(assWeight(300)).toBe(300);
    expect(assWeight(400)).toBe(400);
  });

  it('should parse FontFace weight descriptors', () => {
    expect(parseFontWeight('normal')).toEqual([400, 400]);
    expect(parseFontWeight('bold')).toEqual([700, 700]);
    expect(parseFontWeight('600')).toEqual([600, 600]);
    expect(parseFontWeight('100 900')).toEqual([100, 900]);
    expect(parseFontWeight('heavy')).toBeUndefined();
    expect(parseFontWeight(undefined)).toBeUndefined();
  });

  it('should embolden a face lighter than asked by em/64, without browser bold', async () => {
    await draw(
      script('Test Condensed', ['Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,{\\b1}Text']),
      fontFile(400, 'Test Condensed')
    );
    const fill = calls.find((c) => c.kind === 'fill')!;
    expect(fill.font).toMatch(/\b400\b/);
    expect(fill.font).not.toContain('bold');
    // \b1 asks 700, the face is 400: libass emboldens by em/64 (fontsize 50, ratio 1)
    const stroke = calls[calls.indexOf(fill) - 1]!;
    expect(stroke.kind).toBe('stroke');
    expect(stroke.same).toBe(true);
    expect(stroke.lineWidth).toBeCloseTo(50 / 64, 5);
  });

  it('should not embolden a face flagged bold or whose weight cannot be read', async () => {
    const flagged = fontFile(400, 'Test Sans');
    new DataView(flagged).setUint16(128 + 62, 0x20); // fsSelection: bold
    const woff2 = new ArrayBuffer(64);
    new DataView(woff2).setUint32(0, 0x774f4632); // 'wOF2'
    for (const file of [flagged, woff2]) {
      calls = [];
      await draw(
        script('Test Sans', ['Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,{\\b1}Text']),
        file
      );
      expect(calls.some((c) => c.kind === 'stroke')).toBe(false);
    }
  });

  it('should size each weight by the cell of the face drawn', async () => {
    // The bold file has a cell of 1250 units for its 1000 units em: 50 becomes 40
    const files: Record<string, ArrayBuffer> = {
      '/regular.ttf': fontFile(400, 'Test Sans'),
      '/bold.ttf': fontFile(700, 'Test Sans', 1250)
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => ({ arrayBuffer: async () => files[url] }))
    );
    const ass = new ASS({
      assText: script('Test Sans', ['Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,A{\\b1}B']),
      video: videoElement,
      fonts: [
        { family: 'Test Sans', url: '/regular.ttf' },
        { family: 'Test Sans', url: '/bold.ttf' }
      ]
    });
    await ass.render();
    (ass as any).renderer.forceRender(0.5);
    ass.destroy();
    expect(fillFont('A')).toContain('400 50.000px');
    expect(fillFont('B')).toContain('700 40.000px');
  });

  it('should draw a semibold face as it is when bold is asked', async () => {
    await draw(
      script('Test Sans Semibold', [
        'Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,{\\b1}Text'
      ]),
      fontFile(600, 'Test Sans Semibold')
    );
    // 700 does not exceed 600 + 150: no emboldening, and the browser is asked for 600
    expect(calls.some((c) => c.kind === 'stroke')).toBe(false);
    expect(fillFont('Text')).toMatch(/\b600\b/);
  });

  it('should ask the browser for the weight of \\b when the font is not loaded', async () => {
    const assText = script('Arial', [
      'Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,{\\b1}A',
      'Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,{\\b1\\b400}B',
      'Dialogue: 0,0:00:02.00,0:00:03.00,Default,,0,0,0,,{\\b1\\b0}C',
      'Dialogue: 0,0:00:03.00,0:00:04.00,Default,,0,0,0,,{\\b1\\b5}D'
    ]);
    const fonts: Record<string, string> = {};
    for (const [text, time] of [
      ['A', 0.5],
      ['B', 1.5],
      ['C', 2.5],
      ['D', 3.5]
    ] as const) {
      calls = [];
      await draw(assText, undefined, time);
      fonts[text] = fillFont(text);
    }
    expect(fonts.A).toMatch(/\b700\b/);
    expect(fonts.B).toMatch(/\b400\b/);
    expect(fonts.C).toMatch(/\b400\b/);
    // \b5 is not a weight: libass goes back to the Bold of the style (0), not to the \b1 before it
    expect(fonts.D).toMatch(/\b400\b/);
  });

  it('should size a font asked by a name of its file', async () => {
    // Loaded as "Test Sans", asked as its full name
    await draw(
      script('Test Sans Semibold', ['Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,Text']),
      fontFile(600, 'Test Sans Semibold')
    );
    expect(fillFont('Text')).toContain('50.000px "Test Sans Semibold"');
  });

  it('should fall back to the family without weight, then to Arial and sans-serif', async () => {
    await draw(
      script('Source Sans Pro Semibold', ['Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,Text'])
    );
    expect(fillFont('Text')).toContain(
      '"Source Sans Pro Semibold", "Source Sans Pro", Arial, sans-serif'
    );
  });

  it('should size a loaded font by its cell, usWinAscent + usWinDescent', async () => {
    // The test font has a cell of 1000 units, its em square: 50 stays 50
    await draw(
      script('Test Sans', ['Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,Text']),
      fontFile(400, 'Test Sans')
    );
    expect(fillFont('Text')).toContain('50.000px');
  });

  it('should size a font that is not loaded with the ratio of Arial', async () => {
    await draw(script('Arial', ['Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,Text']));
    expect(fillFont('Text')).toContain('44.750px');
  });

  it('should size the text again when \\fn changes the font', async () => {
    await draw(
      script('Arial', ['Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,{\\fnTest Sans}Text']),
      fontFile(400, 'Test Sans')
    );
    expect(fillFont('Text')).toContain('50.000px');
  });
});
