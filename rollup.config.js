import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';

export default {
  input: 'src/ass.ts',
  output: [
    {
      file: 'dist/ass.min.js',
      format: 'iife',
      name: 'ASS',
      exports: 'named'
    }
  ],
  plugins: [typescript(), resolve(), commonjs(), terser()]
};
