import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import ASS from '../src/ass';

function script(events: string[], borderStyle = 1) {
  return `[Script Info]
PlayResX: 1280
PlayResY: 720
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,50,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,${borderStyle},2,0,2,10,10,10,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events.join('\n')}`;
}

describe('Layers', () => {
  let videoElement: HTMLVideoElement;
  let calls: string[];
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

    calls = [];
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string) {
      const ctx = originalGetContext.apply(this, [type]) as CanvasRenderingContext2D;
      if (type === '2d') {
        const fillText = ctx.fillText;
        const fillRect = ctx.fillRect;
        ctx.fillText = function (this: CanvasRenderingContext2D, ...args: any[]) {
          calls.push(`text ${args[0]}`);
          return fillText.apply(this, args as any);
        };
        ctx.fillRect = function (this: CanvasRenderingContext2D, ...args: any[]) {
          calls.push('rect');
          return fillRect.apply(this, args as any);
        };
      }
      return ctx;
    } as any;
  });

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    vi.restoreAllMocks();
  });

  // Masks painted, in order (see Renderer.paintMask)
  let paints: { color: string; data: Uint8ClampedArray }[];

  async function draw(assText: string) {
    const ass = new ASS({ assText, video: videoElement });
    await ass.render();
    const renderer = (ass as any).renderer;
    paints = [];
    const paintMask = renderer.paintMask.bind(renderer);
    vi.spyOn(renderer, 'paintMask').mockImplementation((...args: any[]) => {
      paints.push({ color: args[1], data: args[0].data });
      return paintMask(...args);
    });
    renderer.display(0.5);
    const canvases = renderer.renderDiv.querySelectorAll('canvas').length;
    ass.destroy();
    return canvases;
  }

  it('should draw every layer on one canvas, lower layers first', async () => {
    const canvases = await draw(
      script([
        'Dialogue: 1,0:00:00.00,0:00:01.00,Default,,0,0,0,,Top',
        'Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,Bottom'
      ])
    );
    expect(canvases).toBe(1);
    expect(calls).toEqual(['text Bottom', 'text Top']);
  });

  it('should draw layers whose numbers are not consecutive', async () => {
    await draw(
      script([
        'Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,Zero',
        'Dialogue: 10,0:00:00.00,0:00:01.00,Default,,0,0,0,,Ten'
      ])
    );
    expect(calls).toEqual(['text Zero', 'text Ten']);
  });

  it('should draw the opaque box under its text', async () => {
    await draw(script(['Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,Boxed'], 3));
    // As in libass, the box is the border of BorderStyle 3, in OutlineColour, painted first
    expect(paints.map((p) => p.color)).toEqual(['#000000', '#ffffff']);
    const [box, text] = paints as [(typeof paints)[0], (typeof paints)[0]];
    expect(text.data.some((v) => v > 0)).toBe(true);
    // The box is opaque under every pixel of the text
    expect(text.data.every((v, i) => v === 0 || box.data[i] === 255)).toBe(true);
  });
});
