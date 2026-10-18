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
      renderer.ppass.filter((d: any) => d.start <= time && time <= d.end);

    // Forward playback, a jump forward, a jump back, and the end of the script
    for (const time of [0, 0.4, 0.99, 1.5, 1.99, 6, 0.2, 0.7, 3, 10, 11]) {
      expect(ends(renderer.getSlices(time))).toEqual(ends(scan(time)));
    }
    ass.destroy();
  });
});
