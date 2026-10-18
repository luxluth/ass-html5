import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import ASS from '../src/ass';

function script(events: string[]) {
  return `[Script Info]
PlayResX: 1280
PlayResY: 720
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,50,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,10,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events.join('\n')}`;
}

describe('Layout', () => {
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

  async function setup(events: string[]) {
    const ass = new ASS({ assText: script(events), video: videoElement });
    await ass.render();
    return { ass, renderer: (ass as any).renderer };
  }

  it('should resolve the style of a fragment once per frame', async () => {
    const { ass, renderer } = await setup([
      'Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,Hello world'
    ]);
    const computeStyle = vi.spyOn(renderer, 'computeStyle');
    renderer.display(0.5);

    // One for the dialogue, one for its only fragment
    expect(computeStyle).toHaveBeenCalledTimes(2);
    ass.destroy();
  });

  it('should measure a run once while the canvas stays the same', async () => {
    const line = 'Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,Hello world';
    const once = await setup([line]);
    const measureOnce = vi.spyOn(once.renderer.layers[0].ctx, 'measureText');
    once.renderer.display(0.5);
    once.ass.destroy();

    const twice = await setup([line, line]);
    const measureTwice = vi.spyOn(twice.renderer.layers[0].ctx, 'measureText');
    twice.renderer.display(0.5);
    twice.ass.destroy();

    expect(measureOnce).toHaveBeenCalled();
    expect(measureTwice).toHaveBeenCalledTimes(measureOnce.mock.calls.length);
  });
});
