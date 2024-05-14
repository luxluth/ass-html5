import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/ass.ts'],
  clean: false,
  dts: true,
  platform: 'browser',
  target: 'esnext',
  noExternal: ['ass-compiler'],
  name: 'ASS',
  globalName: 'ass',
  format: ['esm', 'cjs'],
  async onSuccess() {
    console.log('      END ' + Date().split(' ')[4]);
  }
});
