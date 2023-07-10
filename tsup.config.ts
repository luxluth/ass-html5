import { defineConfig } from 'tsup'

export default defineConfig({
	entryPoints: ['src/index.ts'],
	format: ['cjs', 'esm'],
	dts: true,
	clean: false,
	splitting: true,
	platform: 'browser',
	target: 'es2018',
})
