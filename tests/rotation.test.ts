import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import ASS from '../src/ass';

describe('Rotation Performance Benchmarks', () => {
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
    } as any;
  });

  afterEach(() => {
    videoElement.remove();
  });

  function makeScript(body: string) {
    return `[Script Info]
PlayResX: 1280
PlayResY: 720
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,36,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,2,2,10,10,10,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,${body}`;
  }

  it('measures static rotation cache hit speedup', async () => {
    const ass = new ASS({
      assText: makeScript('{\\pos(640,360)\\frz45}Static Rotated Title'),
      video: videoElement
    });
    await ass.render();
    const renderer = (ass as any).renderer;

    // First render (uncached)
    const t0 = performance.now();
    renderer.forceRender(1);
    const firstRenderTime = performance.now() - t0;

    // 100 consecutive frames (cached)
    const t1 = performance.now();
    for (let frame = 0; frame < 100; frame++) {
      renderer.forceRender(1 + frame * 0.016);
    }
    const cachedAvgTime = (performance.now() - t1) / 100;

    console.log(
      `Static rotation first frame: ${firstRenderTime.toFixed(3)}ms, cached avg: ${cachedAvgTime.toFixed(3)}ms`
    );
    expect(cachedAvgTime).toBeLessThan(firstRenderTime);
    ass.destroy();
  });

  it('measures animated rotation render speed', async () => {
    const ass = new ASS({
      assText: makeScript('{\\pos(640,360)\\t(0,5000,\\frz360)}Animated Spinning Word'),
      video: videoElement
    });
    await ass.render();
    const renderer = (ass as any).renderer;

    const t0 = performance.now();
    const FRAMES = 60;
    for (let f = 0; f < FRAMES; f++) {
      renderer.forceRender(f * 0.016);
    }
    const elapsed = performance.now() - t0;
    const avgPerFrame = elapsed / FRAMES;

    console.log(
      `Animated 2D rotation: ${FRAMES} frames in ${elapsed.toFixed(2)}ms (avg ${avgPerFrame.toFixed(3)}ms/frame)`
    );
    // Each frame should render comfortably well within a 16.6ms (60 FPS) budget
    expect(avgPerFrame).toBeLessThan(16.6);
    ass.destroy();
  });

  it('renders 3D rotation with custom origin (dummy.ass line 40)', async () => {
    const ass = new ASS({
      assText: makeScript(
        '{\\frz338.403\\frx42\\fry30\\pos(371,314)\\org(187,165)}Some more rotation tricks, this time in 3D and with a different origin'
      ),
      video: videoElement
    });
    await ass.render();
    const renderer = (ass as any).renderer;
    renderer.forceRender(1);

    const { canvas, ctx } = renderer.layers[0];
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let nonZero = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3]! > 0) nonZero++;
    }
    expect(nonZero).toBeGreaterThan(100);
    ass.destroy();
  });

  it('renders complex animated rotation with border (dummy.ass line 54)', async () => {
    const text = `{\\xbord0\\ybord0\\t(0,2000,1,\\xbord10\\ybord10)\\an5}This text has a growing border\\N{\\xshad0\\yshad0\\t(0,2000,1,\\xshad10\\yshad10)\\r}This text has an increasing shadow\\N{\\t(0,2000,1,\\fry360)\\r}This text is rotating around the Y axis\\N{\\t(0,2000,1,\\frz720)\\r}This text rotates {\\t(0,2000,1,\\frz720)\\t(0,2000,1,\\frx360)}and this one even more`;
    const ass = new ASS({
      assText: makeScript(text),
      video: videoElement
    });
    await ass.render();
    const renderer = (ass as any).renderer;
    renderer.forceRender(1);

    const { canvas, ctx } = renderer.layers[0];
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let hasBlackOutline = false;
    let hasWhiteFill = false;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;
      const a = data[i + 3]!;
      if (a > 128) {
        if (r > 200 && g > 200 && b > 200) hasWhiteFill = true;
        if (r < 50 && g < 50 && b < 50) hasBlackOutline = true;
      }
    }
    expect(hasWhiteFill).toBe(true);
    expect(hasBlackOutline).toBe(true);

    const t0 = performance.now();
    const FRAMES = 30;
    for (let f = 0; f < FRAMES; f++) {
      renderer.forceRender(f * (2.0 / FRAMES));
    }
    const elapsed = performance.now() - t0;
    console.log(
      `Line 54 animation (5 animated lines): ${FRAMES} frames in ${elapsed.toFixed(2)}ms (avg ${(elapsed / FRAMES).toFixed(3)}ms/frame)`
    );
    ass.destroy();
  });
});
