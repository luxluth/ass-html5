import type { ParsedTag } from 'ass-compiler/types/tags'


export type FontStyle = {
    /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/FontFace/ascentOverride) */
    ascentOverride: string;
    /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/FontFace/descentOverride) */
    descentOverride: string;
    /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/FontFace/display) */
    display: FontDisplay;
    /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/FontFace/family) */
    family: string;
    /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/FontFace/featureSettings) */
    featureSettings: string;
    /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/FontFace/lineGapOverride) */
    lineGapOverride: string;
    /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/FontFace/stretch) */
    stretch: string;
    /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/FontFace/style) */
    style: string;
    /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/FontFace/unicodeRange) */
    unicodeRange: string;
    /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/FontFace/variant) */
    variant: string;
    /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/FontFace/weight) */
    weight: string;
    /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/FontFace/load) */
}

export type Font = {
	family: string,
	url: string,
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


export type Shift = {
	marginL: number
	marginR: number
	marginV: number
}

export type TimeRange = {
	start: number,
	end: number
}

export type SingleStyle = {
	Name: string
	Fontname: string
	Fontsize: string
	PrimaryColour: string
	SecondaryColour: string
	OutlineColour: string
	BackColour: string
	Bold: string
	Italic: string
	Underline: string
	StrikeOut: string
	ScaleX: string
	ScaleY: string
	Spacing: string
	Angle: string
	BorderStyle: string
	Outline: string
	Shadow: string
	Alignment: string
	MarginL: string
	MarginR: string
	MarginV: string
	Encoding: string
}

export type FontDescriptor = {
	fontname: string
	fontsize: number
	bold: boolean
	italic: boolean
	underline: boolean
	strikeout: boolean
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

    export type MoveValues = [number, number, number, number] | [number, number, number, number, number, number]
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
