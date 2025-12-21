import { describe, it, expect, beforeEach, vi } from 'vitest';
import ASS from '../src/ass';

describe('Collision Handling', () => {
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

  it('should shift overlapping lines vertically', async () => {
    const assText = `[Script Info]
Title: Collision Test
PlayResX: 1280
PlayResY: 720
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,50,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,2,2,10,10,10,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,Line 1
Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,Line 2`;

    const fillTextSpy = vi.fn();
    const originalGetContext = HTMLCanvasElement.prototype.getContext;

    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string) {
      const ctx = originalGetContext.apply(this, [type]) as CanvasRenderingContext2D;
      if (type === '2d') {
        vi.spyOn(ctx, 'fillText').mockImplementation(fillTextSpy);
      }
      return ctx;
    } as any;

    const ass = new ASS({
      assText: assText,
      video: videoElement
    });

    await ass.render();
    const renderer = (ass as any).renderer;
    renderer.display(1);

    expect(fillTextSpy).toHaveBeenCalledTimes(2);
    const y1 = fillTextSpy.mock.calls[0]![2];
    const y2 = fillTextSpy.mock.calls[1]![2];

    // They should be different
    expect(y1).not.toBe(y2);
    // Since alignment is 2 (Bottom), Line 2 should be ABOVE Line 1.
    // In Canvas, smaller Y is higher. So y2 < y1.
    expect(y2).toBeLessThan(y1);

    ass.destroy();
    HTMLCanvasElement.prototype.getContext = originalGetContext;
  });
});
