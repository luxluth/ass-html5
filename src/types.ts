import type { ParsedTag } from "ass-compiler/types/tags"

export type ASSOptions = {
    /**
     * The ass text string
     */
    assText: string,
    /**
     * The video to display the subtile on.
     * Can be either an `HTMLVideoElement` or `string` (html query selector )
     */
    video: HTMLVideoElement | string
}

export type Shift = {
    marginL: number
    marginR: number
    marginV: number
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

export type Tag = { [K in keyof ParsedTag]: ParsedTag[K]; }

export type FadeAnimation = {
    name: string,
    values: [number, number] | [number, number, number, number, number, number]
}
