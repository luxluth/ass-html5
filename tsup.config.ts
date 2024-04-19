import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/ass.ts'],
  clean: false,
  dts: false,
  platform: 'browser',
  target: 'esnext',
  noExternal: ['ass-compiler', 'renderer'],
  name: 'ASS',
  globalName: 'ass',
  format: ['esm'],
  async onSuccess() {
    console.log('      END ' + Date().split(' ')[4]);
  }
});
