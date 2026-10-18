import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import ASS from '../src/ass';

function script(playRes: string) {
  return `[Script Info]
${playRes}
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,2,2,10,10,10,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,Hello`;
}

describe('PlayRes', () => {
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

  async function playRes(header: string) {
    const ass = new ASS({ assText: script(header), video: videoElement });
    await ass.render();
    const renderer = (ass as any).renderer;
    const res = [renderer.playerResX, renderer.playerResY];
    ass.destroy();
    return res;
  }

  it('should fill in a missing PlayRes the way libass does', async () => {
    expect(await playRes('')).toEqual([384, 288]);
    expect(await playRes('PlayResX: 640')).toEqual([640, 480]);
    expect(await playRes('PlayResX: 1280')).toEqual([1280, 1024]);
    expect(await playRes('PlayResY: 480')).toEqual([640, 480]);
    expect(await playRes('PlayResY: 1024')).toEqual([1280, 1024]);
    expect(await playRes('PlayResX: 1920\nPlayResY: 1080')).toEqual([1920, 1080]);
  });

  it('should draw a script without PlayRes at a real size', async () => {
    const ass = new ASS({ assText: script(''), video: videoElement });
    await ass.render();
    const renderer = (ass as any).renderer;
    const ctx: CanvasRenderingContext2D = renderer.layers[0].ctx;
    const fonts: string[] = [];
    const fillText = ctx.fillText.bind(ctx);
    ctx.fillText = (...args: Parameters<typeof fillText>) => {
      fonts.push(ctx.font);
      return fillText(...args);
    };
    renderer.display(0.5);

    // Without PlayRes the size was Infinity, an invalid font the canvas ignored
    expect(fonts.length).toBeGreaterThan(0);
    expect(fonts[0]).toContain('Arial');
    ass.destroy();
  });
});
