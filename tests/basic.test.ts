import { describe, it, expect, beforeEach, vi } from 'vitest';
import ASS from '../src/ass';

describe('ASS Library', () => {
  let videoElement: HTMLVideoElement;

  beforeEach(() => {
    // Mock the video element properties
    videoElement = document.createElement('video');
    Object.defineProperty(videoElement, 'videoWidth', { value: 1280 });
    Object.defineProperty(videoElement, 'videoHeight', { value: 720 });
    Object.defineProperty(videoElement, 'clientWidth', { value: 1280 });
    Object.defineProperty(videoElement, 'clientHeight', { value: 720 });
    Object.defineProperty(videoElement, 'offsetLeft', { value: 0 });
    Object.defineProperty(videoElement, 'offsetTop', { value: 0 });
    document.body.appendChild(videoElement);
  });

  it('should instantiate without error', () => {
    const ass = new ASS({
      assText: `[Script Info]
Title: Test
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,2,2,10,10,10,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,Hello World`,
      video: videoElement
    });
    expect(ass).toBeDefined();
  });

  it('should initialize renderer on render()', async () => {
    const ass = new ASS({
      assText: `[Script Info]
Title: Test
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,2,2,10,10,10,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,Hello World`,
      video: videoElement
    });

    // We mock the resize observer since it's not fully implemented in jsdom usually
    global.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };

    // Mock requestAnimationFrame to avoid infinite loops in test if necessary,
    // though for simple start it might be okay.
    // Actually renderer calls requestAnimationFrame.
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      return setTimeout(cb, 16) as unknown as number;
    });

    await ass.render();

    // Check if renderer is attached (private property, so we check side effects or cast to any)
    expect((ass as any).renderer).toBeDefined();

    ass.destroy();
  });
});
