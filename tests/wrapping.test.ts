import { describe, it, expect, beforeEach, vi } from 'vitest';
import ASS from '../src/ass';

describe('Wrapping Support', () => {
  let videoElement: HTMLVideoElement;

  beforeEach(() => {
    videoElement = document.createElement('video');
    Object.defineProperty(videoElement, 'videoWidth', { value: 300 });
    Object.defineProperty(videoElement, 'videoHeight', { value: 200 });
    Object.defineProperty(videoElement, 'clientWidth', { value: 300 });
    Object.defineProperty(videoElement, 'clientHeight', { value: 200 });
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

  it('should wrap text with q1', async () => {
    const assText = `[Script Info]
Title: Wrap Test
PlayResX: 300
PlayResY: 200
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,2,2,10,10,10,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\\\q1}Line that wraps`; // "Line that wraps"

    // Mock measureText
    // "Line" = 40, " " = 10, "that" = 40, " " = 10, "wraps" = 50. Total = 150.
    // Canvas width = 300 - 20 (margins) = 280.
    // Wait, let's make it overflow.
    // "Line that wraps and overflows really long text"

    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    const fillTextSpy = vi.fn();

    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string) {
      const ctx = originalGetContext.apply(this, [type]) as CanvasRenderingContext2D;
      if (type === '2d') {
        vi.spyOn(ctx, 'measureText').mockImplementation((text) => {
          return {
            width: text.length * 10,
            fontBoundingBoxAscent: 10,
            fontBoundingBoxDescent: 2,
            actualBoundingBoxAscent: 10,
            actualBoundingBoxDescent: 2,
            emHeightDescent: 2,
            hangingBaseline: 10
          } as TextMetrics;
        });
        vi.spyOn(ctx, 'fillText').mockImplementation(fillTextSpy);
      }
      return ctx;
    } as any;

    const ass = new ASS({
      assText: assText.replace(
        'Line that wraps',
        'This text is definitely too long for the screen width of 300 pixels assuming 10px per char'
      ),
      video: videoElement
    });

    await ass.render();
    const renderer = (ass as any).renderer;
    renderer.display(1);

    // Total chars: ~90 -> width 900.
    // Max width: 300 - 20 = 280.
    // Should be at least 3-4 lines.

    expect(fillTextSpy).toHaveBeenCalled();
    const calls = fillTextSpy.mock.calls;

    // Collect unique Y coordinates
    const uniqueYs = new Set(calls.map((c) => c[2]));
    expect(uniqueYs.size).toBeGreaterThan(1);

    ass.destroy();
    HTMLCanvasElement.prototype.getContext = originalGetContext;
  });
});
