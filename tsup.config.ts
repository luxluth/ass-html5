import { defineConfig } from 'tsup'
import { copyFile, unlink } from 'fs/promises'

export default defineConfig((opts) => {
	return {
		minify: opts.format?.includes('iife') ? 'terser' : false,
		clean: false,
		dts: !opts.format?.includes('iife') ? true : false,
		platform: 'browser',
		target: 'es2018',
		noExternal: ['ass-compiler'],
		name: 'ASS',
		globalName: 'ASS',
		async onSuccess() {
			if (opts.format?.includes('iife')) {
				await copyFile('./dist/index.global.js', './dist/ass.min.js')
				await unlink('./dist/index.global.js')
			}

			console.log('      END ' + Date().split(' ')[4])
		}
	}
})
