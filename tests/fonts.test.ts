import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import ASS from '../src/ass';
import { parseFontMetrics } from '../src/utils';

// Smallest TrueType file parseFontMetrics reads: head, OS/2 (ratio 1) and name tables.
function fontFile(weight: number, family: string): ArrayBuffer {
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
  view.setUint16(128 + 74, 800); // usWinAscent
  view.setUint16(128 + 76, 200); // usWinDescent

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

type Call = { kind: 'fill' | 'stroke'; text: string; font: string };

describe('Fonts', () => {
  let videoElement: HTMLVideoElement;
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
    vi.stubGlobal(
      'FontFace',
      class {
        status = 'loaded';
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
            calls.push({ kind, text: args[0], font: this.font });
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
