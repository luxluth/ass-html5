import { SubtitleFrameCallback } from './types';

export class DebugTracker {
  fps = 0;
  processingDuration = 0;
  droppedFrames = 0;
  presentedFrames = 0;
  mistimedFrames = 0;

  private startTime = 0;
  private frameTimestamps: number[] = [];
  private durationSamples: number[] = [];

  onsubtitleFrameCallback?: SubtitleFrameCallback;

  startFrame() {
    this.startTime = performance.now();
  }

  dropFrame() {
    this.droppedFrames++;
  }

  endFrame(
    now: number,
    meta: {
      mediaTime: number;
      expectedDisplayTime: number;
      width: number;
      height: number;
      isAnimated: boolean;
    }
  ) {
    this.presentedFrames++;

    // Calculate rolling FPS over the last 1-2 seconds
    this.frameTimestamps.push(now);
    const windowStart = now - 1000;
    while (this.frameTimestamps.length > 0 && this.frameTimestamps[0]! < windowStart) {
      this.frameTimestamps.shift();
    }
    this.fps = this.frameTimestamps.length;

    // Moving average for frame processing time
    const duration = performance.now() - this.startTime;
    this.durationSamples.push(duration);
    if (this.durationSamples.length > 30) this.durationSamples.shift();
    this.processingDuration =
      this.durationSamples.reduce((a, b) => a + b, 0) / this.durationSamples.length;

    const frameDelay = Math.max(0, now - meta.expectedDisplayTime);
    if (frameDelay > 16.67) {
      this.mistimedFrames++;
    }

    if (this.onsubtitleFrameCallback) {
      this.onsubtitleFrameCallback(now, {
        fps: this.fps,
        processingDuration: this.processingDuration,
        droppedFrames: this.droppedFrames,
        presentedFrames: this.presentedFrames,
        mistimedFrames: this.mistimedFrames,
        presentationTime: now,
        expectedDisplayTime: meta.expectedDisplayTime,
        frameDelay,
        width: meta.width,
        height: meta.height,
        mediaTime: meta.mediaTime,
        isAnimated: meta.isAnimated
      });
    }
  }
}
