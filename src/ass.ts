import { compile } from 'ass-compiler'
import { Renderer } from './renderer'
import { ASSOptions as Options, Font } from './types'
import { newCanvas } from './utils'

export default class ASS {
	assText: string
	private video: HTMLVideoElement | string
	videoElement: HTMLVideoElement | null = null
	canvas: HTMLCanvasElement | null = null
	private renderer: Renderer | null = null
	private fonts?: Font[]

	constructor(options: Options) {
		this.assText = options.assText
		this.video = options.video
		this.fonts = options.fonts
	}

	async init() {
		if (typeof this.video == 'string') {
			this.videoElement = document.querySelector(this.video)
			if (this.videoElement === null) {
				throw new Error('Unable to find the video element')
			}
		} else {
			this.videoElement = this.video
		}

		this.setCanvasSize()

		if (typeof this.fonts !== 'undefined') {
			await this.loadFonts(this.fonts)
		}

		this.renderer = new Renderer(
			compile(this.assText, {}),
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

	private async loadFonts(fonts: Font[]) {
		for (const font of fonts) {
			try {
				const loaded = await this.loadFont(font)
				if (loaded) {
					console.info(`Font ${font.family} loaded from ${font.url}`)
				} else {
					console.warn(`Unable to load font ${font.family} from ${font.url}`)
				}
			} catch (e) {
				console.warn(`Unable to load font ${font.family} from ${font.url}`)
				console.warn(e)
			}
		}
	}

	private async getFontUrl(fontUrl: string) {
		const response = await fetch(fontUrl)
		const blob = await response.blob()
		return this.newBlobUrl(blob)
	}

	private newBlobUrl(blob: Blob) {
		return URL.createObjectURL(blob)
	}

	private async loadFont(font: Font) {
		const url = await this.getFontUrl(font.url)
		const fontFace = new FontFace(font.family, `url(${url})`, font.descriptors || {})
		const loadedFace = await fontFace.load()
		// @ts-ignore
		document.fonts.add(loadedFace)
		return fontFace.status === 'loaded'
	}
}
