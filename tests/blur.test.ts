import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import ASS from '../src/ass';

function script(outline: number, text: string) {
  return `[Script Info]
PlayResX: 1280
PlayResY: 720
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,50,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,${outline},0,2,10,10,10,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,${text}`;
}

describe('Blur', () => {
  let videoElement: HTMLVideoElement;
  let strokeFilter: string;
  let fillFilter: string;
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

    strokeFilter = '';
    fillFilter = '';
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string) {
      const ctx = originalGetContext.apply(this, [type]) as CanvasRenderingContext2D;
      if (type === '2d') {
        const strokeText = ctx.strokeText;
        const fillText = ctx.fillText;
        ctx.strokeText = function (this: CanvasRenderingContext2D, ...args: any[]) {
          strokeFilter = this.filter;
          return strokeText.apply(this, args as any);
        };
        ctx.fillText = function (this: CanvasRenderingContext2D, ...args: any[]) {
          fillFilter = this.filter;
          return fillText.apply(this, args as any);
        };
      }
      return ctx;
    } as any;
  });

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    vi.restoreAllMocks();
  });

  async function draw(assText: string) {
    const ass = new ASS({ assText, video: videoElement });
    await ass.render();
    (ass as any).renderer.display(0.5);
    ass.destroy();
  }

  it('should blur the border and keep the fill sharp', async () => {
    await draw(script(3, '{\\blur2}Text'));
    expect(strokeFilter).toContain('blur');
    expect(fillFilter).toBe('none');
  });

  it('should blur the fill when there is no border', async () => {
    await draw(script(0, '{\\blur2}Text'));
    expect(fillFilter).toContain('blur');
  });

  it('should blur as strongly as libass', async () => {
    // PlayResY is the canvas height, so \blur2 is a gaussian of sigma 2 * 0.8493218
    await draw(script(0, '{\\blur2}Text'));
    expect(fillFilter).toBe('blur(1.699px)');

    // Two \be passes have a variance of 1, and are not scaled with PlayRes
    await draw(script(0, '{\\be2}Text'));
    expect(fillFilter).toBe('blur(1.000px)');
  });
});
