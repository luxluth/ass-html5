import { Renderer } from './renderer';
import { DebugTracker } from './debug';
import type { WorkerInboundMessage, PlayheadSource, FontFaceInfo } from './types';

class WorkerPlayhead implements PlayheadSource {
  currentTime = 0;
  paused = true;
  playbackRate = 1;
  videoWidth = 0;
  videoHeight = 0;
  private seekingListeners: Array<() => void> = [];

  addEventListener(type: string, listener: () => void) {
    if (type === 'seeking') {
      this.seekingListeners.push(listener);
    }
  }

  removeEventListener(type: string, listener: () => void) {
    if (type === 'seeking') {
      const idx = this.seekingListeners.indexOf(listener);
      if (idx !== -1) {
        this.seekingListeners.splice(idx, 1);
      }
    }
  }

  emitSeeking() {
    for (const listener of this.seekingListeners) {
      listener();
    }
  }
}

let renderer: Renderer | null = null;
const playhead = new WorkerPlayhead();
let offscreenCanvas: OffscreenCanvas | null = null;

self.onmessage = async (event: MessageEvent<WorkerInboundMessage>) => {
  const message = event.data;
  switch (message.type) {
    case 'init': {
      offscreenCanvas = message.offscreen;
      const fontFacesMap = new Map<string, FontFaceInfo[]>(message.fontFaces);

      if (message.fontBuffers && 'fonts' in self) {
        for (const font of message.fontBuffers) {
          try {
            const face = new FontFace(font.name, font.buffer, font.descriptors);
            await face.load();
            (self as any).fonts.add(face);
          } catch {
            // Ignore font load errors in worker
          }
        }
      }

      let debugTracker: DebugTracker | undefined;
      if (message.debug) {
        debugTracker = new DebugTracker();
        debugTracker.onsubtitleFrameCallback = (now, metadata) => {
          self.postMessage({
            type: 'metrics',
            now,
            metadata
          });
        };
      }

      renderer = new Renderer(
        message.compiledAss,
        message.sizes,
        playhead,
        message.logging,
        undefined,
        fontFacesMap,
        debugTracker,
        message.timeOffset,
        offscreenCanvas
      );

      await renderer.warmup();
      await renderer.startRendering();

      self.postMessage({ type: 'ready' });
      break;
    }

    case 'time': {
      const wasPlaying = !playhead.paused;
      const prevTime = playhead.currentTime;
      playhead.currentTime = message.currentTime;
      playhead.paused = !message.playing;
      playhead.playbackRate = message.playbackRate;
      playhead.videoWidth = message.videoWidth;
      playhead.videoHeight = message.videoHeight;

      if (renderer) {
        if (message.expectedDisplayTime !== undefined) {
          (renderer as any).latestVideoMetadata = {
            presentationTime: performance.now(),
            expectedDisplayTime: message.expectedDisplayTime,
            width: message.videoWidth,
            height: message.videoHeight,
            mediaTime: message.currentTime,
            presentedFrames: 0
          };
          (renderer as any).frameTime = message.currentTime;
        }

        // Handle backward seek or video loop
        if (message.currentTime < prevTime - 0.2) {
          (renderer as any).frameTime = null;
          (renderer as any).lastSyncTimestamp = 0;
          (renderer as any).lastSyncVideoTime = message.currentTime;
          playhead.emitSeeking();
          if (!message.playing) {
            renderer.forceRender(message.currentTime);
          }
        } else if (!message.playing && Math.abs(message.currentTime - prevTime) > 0.05) {
          renderer.forceRender(message.currentTime);
        }
      }
      break;
    }

    case 'resize': {
      if (offscreenCanvas && renderer) {
        const width = Math.round(message.sizes.width * message.dpr);
        const height = Math.round(message.sizes.height * message.dpr);
        if (offscreenCanvas.width !== width || offscreenCanvas.height !== height) {
          offscreenCanvas.width = width;
          offscreenCanvas.height = height;
          renderer.invalidate();
        }
        renderer.forceRender(playhead.currentTime);
      }
      break;
    }

    case 'destroy': {
      if (renderer) {
        renderer.destroy();
        renderer = null;
      }
      offscreenCanvas = null;
      self.close();
      break;
    }
  }
};
