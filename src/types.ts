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
