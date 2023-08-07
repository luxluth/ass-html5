import type { CompiledASSStyle, Dialogue } from 'ass-compiler'
import type { ParsedTag } from 'ass-compiler/types/tags'

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
}

export type FontDescriptor = {
	fontname: string
	fontsize: number
	bold: boolean
	italic: boolean
	underline: boolean
	strikeout: boolean
	/** font transformation */
	t: FontTransfomation
	/** font encoding */
	fe?: number
}

export type FontTransfomation = {
	/** font scale x */
	fscx: number,
	/** font scale y */
	fscy: number,
	/** font rotation z*/
	frz: number,
	/** font rotation x*/
	frx: number,
	/** font rotation y*/
	fry: number,
	/** font shear x */
	fax?: number,
	/** font shear y */
	fay?: number,
	/** font spacing */
	fsp?: number,
	/** wrap style */
	q: 0 | 2 | 1 | 3
}

export type Tag = { [K in keyof ParsedTag]: ParsedTag[K] }

export declare namespace ASSAnimation {
	export type Fade = {
		name: 'fad' | 'fade'
		/**
		 * The values of the fade animation
		 * `\fad(<fadein>,<fadeout>)` or `\fade(<a1>,<a2>,<a3>,<t1>,<t2>,<t3>,<t4>)`
		 */
		values: [number, number] | [number, number, number, number, number, number]
	}

	export type MoveValues =
		| [number, number, number, number]
		| [number, number, number, number, number, number]
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
		values: [number, number]
	}

	export type Animation = Fade | Move | Org
}

export type Tweaks = {
	tweaked: boolean
	primaryColor?: string
	secondaryColor?: string
	outlineColor?: string
	shadowColor?: string
	scaleX?: number
	scaleY?: number
	spacing?: number
	angle?: number
	borderStyle?: number // 1: outline, 3: opaque box ?
	outline?: number
	shadow?: number
	alignment?: number
	position?: [number, number]
	fontDescriptor: FontDescriptor
	custompositioning: boolean
	animations: ASSAnimation.Animation[]
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
