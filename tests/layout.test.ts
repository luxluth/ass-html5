import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import ASS from '../src/ass';
import { buildDrawingPath } from '../src/utils';
import { CHARKIND } from '../src/types';

// jsdom has no Path2D: record the calls so the outline can be checked.
class RecordingPath2D {
  calls: unknown[][] = [];
  moveTo(x: number, y: number) {
    this.calls.push(['moveTo', x, y]);
  }
  lineTo(x: number, y: number) {
    this.calls.push(['lineTo', x, y]);
  }
  bezierCurveTo(...args: number[]) {
    this.calls.push(['bezierCurveTo', ...args]);
  }
  closePath() {
    this.calls.push(['closePath']);
  }
}

// A drawing with a bounding box of -38,-112 and 46x112, at pos(566,46)
const drawingScript = (alignment: number) => `[Script Info]
Title: Drawing Layout
PlayResX: 1280
PlayResY: 720
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,2,2,10,10,10,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\an${alignment}\\pos(566,46)\\fscx125\\fscy125\\p1}m -38 -112 l 8 -112 8 0 -38 0`;

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

describe('Drawing outlines', () => {
  beforeEach(() => {
    vi.stubGlobal('Path2D', RecordingPath2D);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should close each contour before the next m and at the end', () => {
    const path = buildDrawingPath(
      [
        { type: 'M', points: [{ x: 0, y: 0 }] },
        {
          type: 'L',
          points: [
            { x: 10, y: 0 },
            { x: 10, y: 10 }
          ]
        },
        { type: 'M', points: [{ x: 20, y: 20 }] },
        {
          type: 'L',
          points: [
            { x: 30, y: 20 },
            { x: 30, y: 30 }
          ]
        }
      ],
      1,
      1
    ) as unknown as RecordingPath2D;

    expect(path.calls).toEqual([
      ['moveTo', 0, 0],
      ['lineTo', 10, 0],
      ['lineTo', 10, 10],
      ['closePath'],
      ['moveTo', 20, 20],
      ['lineTo', 30, 20],
      ['lineTo', 30, 30],
      ['closePath']
    ]);
  });

  it('should keep negative script coordinates and only scale them', () => {
    const path = buildDrawingPath(
      [
        { type: 'M', points: [{ x: -38, y: -112 }] },
        { type: 'L', points: [{ x: 8, y: -112 }] }
      ],
      1.25,
      1.25
    ) as unknown as RecordingPath2D;

    expect(path.calls[0]).toEqual(['moveTo', -47.5, -140]);
  });
});

describe('Drawing layout', () => {
  let videoElement: HTMLVideoElement;
  let fill: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubGlobal('Path2D', RecordingPath2D);

    // The outline cannot go through a real canvas in jsdom, so painting is recorded instead.
    const proto = (document.createElement('canvas').getContext('2d') as any).constructor.prototype;
    fill = vi.spyOn(proto, 'fill').mockImplementation(() => {});
    vi.spyOn(proto, 'stroke').mockImplementation(() => {});

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
    vi.unstubAllGlobals();
  });

  it('should paint a drawing at its pen position with its script coordinates', async () => {
    const ass = new ASS({ assText: drawingScript(7), video: videoElement });
    await ass.render();
    const renderer = (ass as any).renderer;
    renderer.display(1);

    const drawing = renderer.ppass[0].chars.find((c: any) => c.kind === CHARKIND.DRAWING);
    expect(drawing.pos.x).toBeCloseTo(566);
    expect(drawing.pos.y).toBeCloseTo(46);
    expect(drawing.w).toBeCloseTo(46 * 1.25);

    const outline = fill.mock.calls[0]![0] as unknown as RecordingPath2D;
    expect(outline.calls[0]).toEqual(['moveTo', -47.5, -140]);
    ass.destroy();
  });

  it('should lay out a drawing at the size it is painted, \\fscx included', async () => {
    const ass = new ASS({ assText: drawingScript(8), video: videoElement });
    await ass.render();
    const renderer = (ass as any).renderer;
    const drawing = renderer.ppass[0].chars.find((c: any) => c.kind === CHARKIND.DRAWING);

    drawing.w = 12345; // a width left from an earlier frame must not move the drawing
    renderer.display(1);

    // Centered on the anchor: offset by half of the painted width (57.5)
    expect(drawing.pos.x).toBeCloseTo(566 - (46 * 1.25) / 2);
    ass.destroy();
  });
});
