import { describe, it, expect, beforeEach, vi } from 'vitest';
import ASS from '../src/ass';

// Mock fetch
global.fetch = vi.fn();

describe('ASS API', () => {
  let videoElement: HTMLVideoElement;

  beforeEach(() => {
    videoElement = document.createElement('video');
    document.body.appendChild(videoElement);

    global.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };

    vi.clearAllMocks();
  });

  it('should init with subUrl', async () => {
    const assText = '[Script Info]\nTitle: Test';
    (global.fetch as any).mockResolvedValue({
      text: () => Promise.resolve(assText)
    });

    const ass = new ASS({
      subUrl: '/test.ass',
      video: videoElement
    });

    await ass.render();

    expect(global.fetch).toHaveBeenCalledWith('/test.ass');
    expect(ass.assText).toBe(assText);
  });

  it('should switch text with setAssText', async () => {
    const ass1 = '[Script Info]\nTitle: One';
    const ass2 = '[Script Info]\nTitle: Two';

    const ass = new ASS({
      assText: ass1,
      video: videoElement
    });

    await ass.render();
    expect(ass.assText).toBe(ass1);

    await ass.setAssText(ass2);
    expect(ass.assText).toBe(ass2);
  });

  it('should switch url with setSubUrl', async () => {
    const ass1 = '[Script Info]\nTitle: One';
    const ass2 = '[Script Info]\nTitle: Two';

    (global.fetch as any).mockResolvedValueOnce({
      text: () => Promise.resolve(ass1)
    });
    (global.fetch as any).mockResolvedValueOnce({
      text: () => Promise.resolve(ass2)
    });

    const ass = new ASS({
      subUrl: '/one.ass',
      video: videoElement
    });

    await ass.render();
    expect(ass.assText).toBe(ass1);

    await ass.setSubUrl('/two.ass');
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenLastCalledWith('/two.ass');
    expect(ass.assText).toBe(ass2);
  });
});
