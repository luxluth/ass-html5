import { parse, compile } from 'ass-compiler'
import { Renderer } from './renderer'
import { ASSOptions as Options, Font } from './types'
import { newCanvas } from './utils'

export default class ASS {
	assText: string
	video: HTMLVideoElement | string
	videoElement: HTMLVideoElement | null = null
	canvas: HTMLCanvasElement | null = null
	renderer: Renderer | null = null
	private fonts?: Font[]

	constructor(options: Options) {
		this.assText = options.assText
		this.video = options.video
		this.fonts = options.fonts
		console.debug(compile(options.assText, {}))
	}

	init() {
		if (typeof this.video == 'string') {
			this.videoElement = document.querySelector(this.video)
			if (this.videoElement === null) {
				throw new Error('Unable to find the video element')
			}
		} else {
			this.videoElement = this.video
		}

		if (typeof this.fonts !== 'undefined') {
			this.loadFonts(this.fonts)
		}

		this.setCanvasSize()
		this.renderer = new Renderer(
			parse(this.assText),
			this.canvas as HTMLCanvasElement,
			this.videoElement
		)
		this.videoElement?.addEventListener('loadedmetadata', () => {
			this.setCanvasSize()
		})

		window.addEventListener('resize', () => {
			this.setCanvasSize()
			this.renderer?.redraw()
			// console.debug('resize')
		})

		this.renderer.render()
	}

	destroy() {
		this.videoElement?.removeEventListener('loadedmetadata', () => {
			this.setCanvasSize()
		})
		window.removeEventListener('resize', () => {
			this.setCanvasSize()
			this.renderer?.redraw()
		})

		this.canvas?.remove()
		this.canvas = null

		this.renderer?.destroy()
		this.renderer = null
	}

	private setCanvasSize() {
		const { videoWidth, videoHeight, offsetTop, offsetLeft } = this.videoElement as HTMLVideoElement
		const aspectRatio = videoWidth / videoHeight

		const maxWidth = this.videoElement?.clientWidth || 0
		const maxHeight = this.videoElement?.clientHeight || 0

		let width = maxWidth
		let height = maxHeight
		let x = offsetLeft
		let y = offsetTop

		if (maxHeight * aspectRatio > maxWidth) {
			width = maxWidth
			height = width / aspectRatio
			y += (maxHeight - height) / 2
		} else {
			height = maxHeight
			width = height * aspectRatio
			x += (maxWidth - width) / 2
		}

		if (this.canvas === null) {
			this.canvas = newCanvas(y, x, width, height, this.videoElement as HTMLVideoElement)
		} else {
			this.canvas.style.position = 'absolute'
			this.canvas.style.top = y + 'px'
			this.canvas.style.left = x + 'px'
			this.canvas.style.width = width + 'px'
			this.canvas.style.height = height + 'px'
			this.canvas.width = width
			this.canvas.height = height
		}
	}

	private loadFonts(fonts: Font[]) {
		for (const font of fonts) {
			const fontFace = new FontFace(font.family, `url(${font.url})`, font.descriptors)
			fontFace.load().then((loadedFace) => {
				if (!document.fonts.check(loadedFace.family)) {
					console.warn(`Unable to load font ${font.family}`)
				} else {
					console.info(`Loaded font ${font.family}`)
				}
			})
		}
	}

}
