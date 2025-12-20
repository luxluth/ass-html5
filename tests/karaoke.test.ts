import { describe, it, expect, beforeEach, vi } from 'vitest';
import ASS from '../src/ass';

describe('Karaoke Support', () => {
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

    // Mock ResizeObserver
    global.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };

    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      return setTimeout(cb, 16) as unknown as number;
    });
  });

  it('should parse \k tags and assign timing to characters', async () => {
    const assText = `[Script Info]
Title: Karaoke Test
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,2,2,10,10,10,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\\\k50}Hel{\\\\k50}lo`;

    const ass = new ASS({
      assText: assText,
      video: videoElement
    });

    await ass.render();
    const renderer = (ass as any).renderer;
    const dialogues = renderer.ppass;

    expect(dialogues.length).toBe(1);
    const chars = dialogues[0].chars;

    // "Hel" -> k50 -> 0.5s duration. Start 0. End 0.5.
    // "lo" -> k50 -> 0.5s duration. Start 0.5. End 1.0.

    // Check 'H'
    expect(chars[0].c).toBe('H');
    expect(chars[0].karaoke).toBeDefined();
    expect(chars[0].karaoke.start).toBe(0);
    expect(chars[0].karaoke.end).toBe(0.5);
    expect(chars[0].karaoke.type).toBe('k');

    // Check 'l' (index 2)
    expect(chars[2].c).toBe('l');
    expect(chars[2].karaoke.start).toBe(0);
    expect(chars[2].karaoke.end).toBe(0.5);

    // Check 'l' (index 3) - start of second chunk
    expect(chars[3].c).toBe('l');
    expect(chars[3].karaoke).toBeDefined();
    expect(chars[3].karaoke.start).toBe(0.5);
    expect(chars[3].karaoke.end).toBe(1.0);

    ass.destroy();
  });
});
