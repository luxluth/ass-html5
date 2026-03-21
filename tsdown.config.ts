import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/ass.ts'],
  clean: false,
  dts: true,
  platform: 'browser',
  target: 'esnext',
  name: 'ASS',
  globalName: 'ass',
  format: ['esm'],
  deps: {
    onlyBundle: ['ass-compiler']
  }
});
