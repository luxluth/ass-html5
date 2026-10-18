import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import ASS from '../src/ass';

// A runs 0-1 s, B runs 1-2 s and C is long, 0-10 s. Each event is identified by its end.
const assText = `[Script Info]
Title: Timing
PlayResX: 1280
PlayResY: 720
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,2,2,10,10,10,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,A
Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,B
Dialogue: 0,0:00:00.00,0:00:10.00,Default,,0,0,0,,C`;

describe('Dialogue timing', () => {
  let videoElement: HTMLVideoElement;

  beforeEach(() => {
    videoElement = document.createElement('video');
    Object.defineProperty(videoElement, 'videoWidth', { value: 1280 });
    Object.defineProperty(videoElement, 'videoHeight', { value: 720 });
    Object.defineProperty(videoElement, 'clientWidth', { value: 1280 });
    Object.defineProperty(videoElement, 'clientHeight', { value: 720 });
    Object.defineProperty(videoElement, 'offsetLeft', { value: 0 });
    Object.defineProperty(videoElement, 'offsetTop', { value: 0 });
    document.body.appendChild(videoElement);

    global.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };

    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      return setTimeout(cb, 16) as unknown as number;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // The compiled order is by start time, so the draw order is not the file order: compare sets.
  const ends = (slices: { end: number }[]) => slices.map((d) => d.end).sort((a, b) => a - b);

  it('should show an event from its start up to, not including, its end', async () => {
    const ass = new ASS({ assText, video: videoElement });
    await ass.render();
    const renderer = (ass as any).renderer;

    expect(ends(renderer.getSlices(0))).toEqual([1, 10]);
    expect(ends(renderer.getSlices(1))).toEqual([2, 10]);
    expect(ends(renderer.getSlices(10))).toEqual([]);
    ass.destroy();
  });

  it('should keep a long event when seeking back', async () => {
    const ass = new ASS({ assText, video: videoElement });
    await ass.render();
    const renderer = (ass as any).renderer;

    expect(ends(renderer.getSlices(0.5))).toEqual([1, 10]);
    expect(ends(renderer.getSlices(2.5))).toEqual([10]);
    expect(ends(renderer.getSlices(0.5))).toEqual([1, 10]);
    ass.destroy();
  });

  it('should select the same dialogues as a scan of the whole script', async () => {
    const ass = new ASS({ assText, video: videoElement });
    await ass.render();
    const renderer = (ass as any).renderer;
    const scan = (time: number) =>
      renderer.ppass.filter((d: any) => d.start <= time && time < d.end);

    // Forward playback, a jump forward, a jump back, and the end of the script
    for (const time of [0, 0.4, 0.99, 1.5, 1.99, 6, 0.2, 0.7, 3, 10, 11]) {
      expect(ends(renderer.getSlices(time))).toEqual(ends(scan(time)));
    }
    ass.destroy();
  });

  it('should animate \\t from the current value and hold the target after it', async () => {
    const ass = new ASS({
      assText: assText.replace(',,A', ',,{\\1a&H80&\\t(0,100,\\bord6\\3c&HFF4E03&\\1a&H00&)}A'),
      video: videoElement
    });
    await ass.render();
    const renderer = (ass as any).renderer;
    const d = renderer.ppass.find((x: any) => x.chars.some((c: any) => c.c === 'A'));
    const fontAt = (time: number) =>
      renderer.resolveChars(d, renderer.layers[0], time).get(d.chars[0]).font;

    expect(fontAt(0).xbord).toBe(2);
    expect(fontAt(0.05).xbord).toBeCloseTo(4);
    expect(fontAt(0.2).xbord).toBe(6);
    expect(fontAt(0).colors.a1).toBe(0x80);
    expect(fontAt(0.05).colors.a1).toBe(0x40);
    expect(fontAt(0.2).colors.a1).toBe(0);
    expect(fontAt(0).colors.c3).toBe('#000000');
    expect(fontAt(0.05).colors.c3).toBe('#022780');
    expect(fontAt(0.2).colors.c3).toBe('#034eff');
    ass.destroy();
  });

  it('should repaint a drawing animated with \\t on every frame', async () => {
    vi.stubGlobal('Path2D', class {}); // jsdom has no Path2D
    const ass = new ASS({
      assText: assText.replace(',,A', ',,{\\t(0,1000,\\frz90)\\p1}m 0 0 l 10 0 10 10{\\p0}'),
      video: videoElement
    });
    await ass.render();
    const renderer = (ass as any).renderer;
    // Only which frames are painted matters here, not the drawing
    const paint = vi.spyOn(renderer, 'showDialogue').mockImplementation(() => {});
    renderer.display(0.1);
    paint.mockClear();
    renderer.display(0.2);

    expect(paint).toHaveBeenCalled();
    ass.destroy();
    vi.unstubAllGlobals();
  });

  // x of the text drawn at each time, for a 2 s event aligned on the left (\an7)
  async function moveX(move: string, times: number[]) {
    const ass = new ASS({
      assText: assText.replace(',,A', `,,{\\an7${move}}A`),
      video: videoElement
    });
    await ass.render();
    const renderer = (ass as any).renderer;
    let x = NaN;
    // Where the layout puts the word, before it is rasterized
    vi.spyOn(renderer, 'drawWord').mockImplementation((word: any) => {
      if (word.value[0].c === 'A') x = word.value[0].pos.x;
      return null;
    });
    const xs = times.map((time) => {
      renderer.forceRender(time);
      return x;
    });
    ass.destroy();
    return xs;
  }

  it('should move between t1 and t2 of \\move, counted from the start of the event', async () => {
    const xs = await moveX('\\move(0,0,100,0,200,600)', [0.1, 0.4, 0.8]);
    expect(xs[0]).toBeCloseTo(0, 5);
    expect(xs[1]).toBeCloseTo(50, 5);
    expect(xs[2]).toBeCloseTo(100, 5);
  });

  it('should move over the whole event when \\move has no times', async () => {
    // A runs 0-1 s
    const xs = await moveX('\\move(0,0,100,0)', [0, 0.5]);
    expect(xs[0]).toBeCloseTo(0, 5);
    expect(xs[1]).toBeCloseTo(50, 5);
  });
});
