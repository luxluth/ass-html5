import type { CompiledASSStyle, Dialogue } from 'ass-compiler'
import type { ParsedTag } from 'ass-compiler/types/tags'
import type { Renderer } from './renderer'

export type FontStyle = {
	/** [MDN Reference](https://developer.mozilla.org/docs/Web/API/FontFace/ascentOverride) */
	ascentOverride: string
	/** [MDN Reference](https://developer.mozilla.org/docs/Web/API/FontFace/descentOverride) */
	descentOverride: string
	/** [MDN Reference](https://developer.mozilla.org/docs/Web/API/FontFace/display) */
	display: FontDisplay
	/** [MDN Reference](https://developer.mozilla.org/docs/Web/API/FontFace/family) */
	family: string
	/** [MDN Reference](https://developer.mozilla.org/docs/Web/API/FontFace/featureSettings) */
	featureSettings: string
	/** [MDN Reference](https://developer.mozilla.org/docs/Web/API/FontFace/lineGapOverride) */
	lineGapOverride: string
	/** [MDN Reference](https://developer.mozilla.org/docs/Web/API/FontFace/stretch) */
	stretch: string
	/** [MDN Reference](https://developer.mozilla.org/docs/Web/API/FontFace/style) */
	style: string
	/** [MDN Reference](https://developer.mozilla.org/docs/Web/API/FontFace/unicodeRange) */
	unicodeRange: string
	/** [MDN Reference](https://developer.mozilla.org/docs/Web/API/FontFace/variant) */
	variant: string
	/** [MDN Reference](https://developer.mozilla.org/docs/Web/API/FontFace/weight) */
	weight: string
	/** [MDN Reference](https://developer.mozilla.org/docs/Web/API/FontFace/load) */
}

export type Font = {
	family: string
	url: string
	descriptors?: Partial<FontStyle>
}

export type OnInitSizes = {
	width: number
	height: number
	x: number
	y: number
}

export type ASSOptions = {
	/**
	 * The ass text string
	 */
	assText: string

	/**
	 * The video to display the subtile on.
	 * Can be either an `HTMLVideoElement` or `string` (html query selector )
	 */
	video: HTMLVideoElement | string

	/**
	 * Fonts to load
	 */
	fonts?: Font[]

	/**
	 * Corresponds to the `z-index` to placed the Canvas renderer
	 */
	zIndex?: number
}

export type FontDescriptor = {
	fontname: string
	fontsize: number
	bold: boolean
	italic: boolean
	underline: boolean
	strikeout: boolean
	colors: Colors
	/** font transformation */
	t: FontTransfomation
	/** x border */
	xbord: number
	/** y border */
	ybord: number
	xshad: number
	yshad: number
	/** shadow blur */
	blur: number
	/** font encoding */
	fe?: number
	borderStyle: number
	opacity: number
}

export type Layer = {
	canvas: HTMLCanvasElement
	ctx: CanvasRenderingContext2D
}

export type Colors = {
	c1: string
	a1: number
	c2: string
	a2: number
	c3: string
	a3: number
	c4: string
	a4: number
}

export type FontTransfomation = {
	/** font scale x */
	fscx: number
	/** font scale y */
	fscy: number
	/** font rotation z*/
	frz: number
	/** font rotation x*/
	frx: number
	/** font rotation y*/
	fry: number
	/** font shear x */
	fax?: number
	/** font shear y */
	fay?: number
	/** font spacing */
	fsp?: number
	/** wrap style */
	q: 0 | 2 | 1 | 3
}

export type Tag = { [K in keyof ParsedTag]: ParsedTag[K] }

export declare namespace ASSAnimation {
	export type Fade =
		| {
				name: 'fad'
				/**
				 * The values of the fade animation
				 * `\fad(<fadein>,<fadeout>)` or `\fade(<a1>,<a2>,<a3>,<t1>,<t2>,<t3>,<t4>)`
				 */
				values: FadValues
		  }
		| {
				name: 'fade'
				values: FadeValues
		  }

	export type FadeValues = [number, number, number, number, number, number, number]
	export type FadValues = [number, number]

	export type MoveValues = MoveValuesSimple | MoveValuesComplex

	export type MoveValuesSimple = [number, number, number, number]
	export type MoveValuesComplex = [number, number, number, number, number, number]

	export type Move = {
		name: 'move'
		/**
		 * The values of the move animation
		 * `\move(<x1>,<y1>,<x2>,<y2>)` or `\move(<x1>,<y1>,<x2>,<y2>,<t1>,<t2>)`
		 */
		values: MoveValues
	}

	export type Org = {
		name: 'org'
		/**
		 * The values of the Rotation origin animation
		 * `\org(<x>,<y>)`
		 */
		values: OrgValues
	}

	export type OrgValues = [number, number]

	export type Animation = Fade | Move | Org

	export type Word =
		| {
				type: 'word'
				text: string
				font: FontDescriptor
				style: string
				position: Position
		  }
		| {
				type: 'drawing'
				height: number
				width: number
				drawing: string
				position: Position
				font: FontDescriptor
				opacity: number
		  }

	export type FrameRenderState = {
		playerResX: number
		playerResY: number
		canvas: {
			width: number
			height: number
		}
		time: number
		words: Word[]
		layer: number
		x: number
		y: number
		width: number
		height: number
	}

	export type Bundle = {
		animations: Animation[]
		start: number
		end: number
		frames: FrameRenderState[]
		hash: number
		active: boolean
		layer: number
		taskId?: number
	}
}

export type Override = {
	dialogue: Dialogue
	style: CompiledASSStyle
}

export type Styles = { [styleName: string]: CompiledASSStyle }

export type Position = {
	x: number
	y: number
}
export interface DrawingStrategy {
	renderer: Renderer
	dialogue: Dialogue
	styles: Styles
	draw(): void
}

export type SingleTask<T> = {
	id: number
	task: T
	data?: {
		[key: string]: any
	}
	exec?: () => void
}

export interface TaskScheduler<T> {
	tasks: SingleTask<T>[]
	addTask(task: T, data?: { [key: string]: any}, exec?: () => void ): number 
	removeTask(id: number): void
	clear(): void
	isEmpty(): boolean
	findTask(id: number): T | null
}
