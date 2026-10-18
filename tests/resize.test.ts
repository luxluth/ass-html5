import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import ASS from '../src/ass';

const assText = `[Script Info]
PlayResX: 1280
PlayResY: 720
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,2,2,10,10,10,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,Hello`;

describe('Canvas size', () => {
  let videoElement: HTMLVideoElement;

  const setSize = (prop: string, value: number) =>
    Object.defineProperty(videoElement, prop, { value, configurable: true });

  beforeEach(() => {
    videoElement = document.createElement('video');
    setSize('videoWidth', 1280);
    setSize('videoHeight', 720);
    setSize('clientWidth', 1280);
    setSize('clientHeight', 720);
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

  it('should paint again right away when the canvas is resized', async () => {
    const ass = new ASS({ assText, video: videoElement });
    await ass.render();
    const renderer = (ass as any).renderer;
    const paint = vi.spyOn(renderer, 'showDialogue');

    setSize('clientWidth', 640);
    setSize('clientHeight', 360);
    (ass as any).setCanvasSize();

    expect(renderer.layers[0].canvas.width).toBe(640);
    expect(paint).toHaveBeenCalledTimes(1);
    ass.destroy();
  });

  it('should not clear the canvas when its size does not change', async () => {
    const ass = new ASS({ assText, video: videoElement });
    await ass.render();
    const canvas: HTMLCanvasElement = (ass as any).renderer.layers[0].canvas;
    const width = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'width')!;
    let sets = 0;
    Object.defineProperty(canvas, 'width', {
      get() {
        return width.get!.call(this);
      },
      set(value) {
        sets++;
        width.set!.call(this, value);
      }
    });

    (ass as any).setCanvasSize();
    expect(sets).toBe(0);
    ass.destroy();
  });

  it('should size the canvas from the script before the video metadata loads', async () => {
    setSize('videoWidth', 0);
    setSize('videoHeight', 0);
    setSize('clientWidth', 1280);
    setSize('clientHeight', 1000);
    const ass = new ASS({ assText, video: videoElement });
    await ass.render();
    const canvas: HTMLCanvasElement = (ass as any).renderer.layers[0].canvas;

    // 16 by 9 from PlayRes, centered in the element
    expect(canvas.width).toBe(1280);
    expect(canvas.height).toBe(720);
    ass.destroy();
  });
});
