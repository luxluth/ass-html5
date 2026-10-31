import { defineConfig } from 'rolldown';

export default defineConfig({
  input: 'src/ass.ts',
  platform: 'browser',
  output: [
    {
      file: 'dist/ass.min.js',
      format: 'iife',
      name: 'ASS',
      exports: 'named',
      minify: true
    }
  ]
});
