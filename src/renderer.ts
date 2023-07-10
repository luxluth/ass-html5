import type { ParsedASS, ParsedASSEventText } from "ass-compiler";
import { SingleStyle, FontDescriptor, Tag, FadeAnimation, Shift } from "./types";
import { ruleOfThree, convertAegisubToRGBA } from "./utils";

export class Renderer {
    parsedAss: ParsedASS
    canvas: HTMLCanvasElement
    ctx: CanvasRenderingContext2D
    video: HTMLVideoElement
    playerResX: number
    playerResY: number
    styles: SingleStyle[]
    constructor(
        parsedASS: ParsedASS, 
        canvas: HTMLCanvasElement,
        video: HTMLVideoElement
    ) {
        this.parsedAss = parsedASS
        this.playerResX = parseFloat(this.parsedAss.info.PlayResX)
        this.playerResY = parseFloat(this.parsedAss.info.PlayResY)
        this.styles = parsedASS.styles.style as SingleStyle[]
        this.canvas = canvas
        this.video = video
        this.ctx = canvas.getContext("2d") as CanvasRenderingContext2D
        if (this.ctx === null) { throw new Error("Unable to initilize the Canvas 2D context") }
        let data = [
            {parsedAss : this.parsedAss},
            {canvas : this.canvas},
            {ctx : this.ctx}
        ]
        console.debug(data)
    }

    render() {
        this.video.addEventListener('timeupdate', () => {
            this.diplay(this.video.currentTime)
        })
    }

    destroy() {
        this.video.removeEventListener('timeupdate', () => {
            this.diplay(this.video.currentTime)
        })
    }

    redraw() { this.diplay(this.video.currentTime) }

    diplay(time: number) {
        const overlappingDialoguesEvents = this.parsedAss.events.dialogue.filter(event =>
            event.Start <= time && event.End >= time
        );

        // Clear the canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        overlappingDialoguesEvents.forEach(event => {
            console.debug(event)
            const { Style, Text, MarginL, MarginR, MarginV } = event;
            const style = this.getStyle(Style);
            if (style === undefined) { return; }
            this.showText(Text, style, { marginL: MarginL, marginR: MarginR, marginV: MarginV });
        });
    }

    showText(Text: ParsedASSEventText, style: SingleStyle, shift: Shift) {
        const text = Text.parsed[0]?.text as string
        // console.debug(style.Name, text)
        const tags = Text.parsed[0]?.tags as Tag[]

        let fontDescriptor = this.getFontDescriptor(style) // FontDescriptor
        let c1 = convertAegisubToRGBA(style.PrimaryColour, tags) // primary color
        let c2 = convertAegisubToRGBA(style.SecondaryColour, tags) // secondary color
        let c3 = convertAegisubToRGBA(style.OutlineColour, tags) // outline color
        let c4 = convertAegisubToRGBA(style.BackColour, tags) // shadow color
        let marginL = ruleOfThree(this.playerResX, this.canvas.width) * parseFloat(style.MarginL) / 100 +
            ruleOfThree(this.playerResX, this.canvas.width) * shift.marginL / 100
        let marginV = ruleOfThree(this.playerResY, this.canvas.height) * parseFloat(style.MarginV) / 100 +
            ruleOfThree(this.playerResY, this.canvas.height) * shift.marginV / 100
        let marginR = ruleOfThree(this.playerResX, this.canvas.width) * parseFloat(style.MarginR) / 100 +
            ruleOfThree(this.playerResX, this.canvas.width) * shift.marginR / 100
        // console.debug(marginL, marginV, marginR)

        this.ctx.font = ` ${fontDescriptor.bold ? "bold" : ""} ${fontDescriptor.italic ? "italic" : ""}  ${fontDescriptor.fontsize}px ${fontDescriptor.fontname}`;
        // console.debug(this.ctx.font)
        let textAlign = this.getAlignment(parseInt(style.Alignment)) as CanvasTextAlign;
        let textBaseline = this.getBaseLine(parseInt(style.Alignment)) as CanvasTextBaseline;
        this.ctx.fillStyle = c1;
        this.ctx.strokeStyle = c3;
        this.ctx.lineWidth = ruleOfThree(this.playerResX, this.canvas.width) * parseFloat(style.Outline) / 100 * 2;
        // console.debug(this.ctx.lineWidth, style.Outline)
        this.ctx.lineJoin = "round";
        this.ctx.lineCap = "round";
        this.ctx.miterLimit = 2;
        this.ctx.shadowColor = c4;
        this.ctx.shadowBlur = ruleOfThree(this.playerResX, this.canvas.width) * parseFloat(style.Shadow) / 100;
        this.ctx.shadowOffsetX = ruleOfThree(this.playerResX, this.canvas.width) * parseFloat(style.Shadow) / 100;
        this.ctx.shadowOffsetY = ruleOfThree(this.playerResY, this.canvas.height) * parseFloat(style.Shadow) / 100;

        let alreadyDrawn = false;

        let tweaks = this.teawksDrawSettings(tags, fontDescriptor);
        if (tweaks.tweaked) {
            // console.debug("tweaks", tweaks)

            if (typeof tweaks.primaryColor !== "undefined") { this.ctx.fillStyle = tweaks.primaryColor }
            if (typeof tweaks.secondaryColor !== "undefined") { this.ctx.strokeStyle = tweaks.secondaryColor }
            if (typeof tweaks.outlineColor !== "undefined") { this.ctx.strokeStyle = tweaks.outlineColor }
            if (typeof tweaks.shadowColor !== "undefined") { this.ctx.shadowColor = tweaks.shadowColor }
            if (typeof tweaks.scaleX !== "undefined") { }
            if (typeof tweaks.scaleY !== "undefined") { }
            if (typeof tweaks.spacing !== "undefined") { }
            if (typeof tweaks.angle !== "undefined") { }
            if (typeof tweaks.borderStyle !== "undefined") { }
            if (typeof tweaks.outline !== "undefined") {
                // console.debug("tweaks.outline", tweaks.outline)
                if (tweaks.outline === 0) {
                    this.ctx.strokeStyle = "rgba(0,0,0,0)"
                } else {
                    this.ctx.lineWidth = ruleOfThree(this.playerResX, this.canvas.width) * tweaks.outline / 100 * 2;
                }
            }
            if (typeof tweaks.shadow !== "undefined") {
                this.ctx.shadowBlur = ruleOfThree(this.playerResX, this.canvas.width) * tweaks.shadow / 100;
                this.ctx.shadowOffsetX = ruleOfThree(this.playerResX, this.canvas.width) * tweaks.shadow / 100;
                this.ctx.shadowOffsetY = ruleOfThree(this.playerResY, this.canvas.height) * tweaks.shadow / 100;
            }
            if (typeof tweaks.fontDescriptor !== "undefined") {
                this.ctx.font = ` ${tweaks.fontDescriptor.bold ? "bold" : ""} ${tweaks.fontDescriptor.italic ? "italic" : ""}  ${tweaks.fontDescriptor.fontsize}px ${tweaks.fontDescriptor.fontname}`;
            }
            if (typeof tweaks.alignment !== "undefined") { 
                textAlign = this.getAlignment(tweaks.alignment) as CanvasTextAlign;
                textBaseline = this.getBaseLine(tweaks.alignment as number) as CanvasTextBaseline;
            }
            if (typeof tweaks.position !== "undefined") {
                this.drawTextAtPosition(text, tweaks.position, textAlign, textBaseline);
                alreadyDrawn = true;
            }
        }

        if (!alreadyDrawn) {
            this.drawText(text, textAlign, textBaseline, marginL, marginV, marginR);
        }
    }

    teawksDrawSettings(
        tags: Tag[],
        fontDescriptor: FontDescriptor
    ) {
        const tweaked = tags.length > 0 ? true : false;
        // put all the tags in the same object
        let tagsCombined: Tag = {};
        tags.forEach((tag) => {tagsCombined = { ...tagsCombined, ...tag }})
        // console.debug("tagsCombined", tagsCombined)
        const primaryColor = typeof tagsCombined.c1 !== "undefined" ? convertAegisubToRGBA("00" + tagsCombined.c1, tags) : undefined;
        const secondaryColor = typeof tagsCombined.c2 !== "undefined" ? convertAegisubToRGBA("00" + tagsCombined.c2, tags) : undefined;
        const outlineColor = typeof tagsCombined.c3 !== "undefined" ? convertAegisubToRGBA("00" + tagsCombined.c3, tags) : undefined;
        const shadowColor = typeof tagsCombined.c4 !== "undefined" ? convertAegisubToRGBA("00" + tagsCombined.c4, tags) : undefined;
        const bold = typeof tagsCombined.b !== "undefined" ? true : undefined;
        const italic = typeof tagsCombined.i !== "undefined" ? true : undefined;
        const underline = typeof tagsCombined.u !== "undefined" ? true : undefined;
        const strikeOut = typeof tagsCombined.s !== "undefined" ? true : undefined;
        const scaleX = typeof tagsCombined.xbord !== "undefined" ? tagsCombined.xbord : undefined;
        const scaleY = typeof tagsCombined.ybord !== "undefined" ? tagsCombined.ybord : undefined;
        const spacing = typeof tagsCombined.xshad !== "undefined" ? tagsCombined.xshad : undefined;
        const angle = typeof tagsCombined.fax !== "undefined" ? tagsCombined.fax : undefined;
        const borderStyle = typeof tagsCombined.bord !== "undefined" ? tagsCombined.bord : undefined;
        const outline = typeof tagsCombined.bord !== "undefined" ? tagsCombined.bord : undefined;
        const shadow = typeof tagsCombined.shad !== "undefined" ? tagsCombined.shad : undefined;
        const alignment = typeof tagsCombined.a !== "undefined" ? tagsCombined.a : undefined;
        const position = typeof tagsCombined.pos !== "undefined" ? 
            [
                ruleOfThree(this.playerResX, this.canvas.width) * tagsCombined.pos[0] / 100,
                ruleOfThree(this.playerResY, this.canvas.height) * tagsCombined.pos[1] / 100
            ] as [number, number] : undefined;
        
        const fontsize = tagsCombined.fs ? tagsCombined.fs : undefined;
        const fontname = tagsCombined.fn ? tagsCombined.fn : undefined;

        // Animation
        const simpleFadeAnimation = typeof tagsCombined.fad !== "undefined" ? tagsCombined.fad : undefined;
        const complexFadeAnimation = typeof tagsCombined.fade !== "undefined" ? tagsCombined.fade : undefined;
        
        const fadeAnimation = typeof simpleFadeAnimation !== "undefined" ? {
            name: "simpleFade",
            values: simpleFadeAnimation
        } as FadeAnimation : typeof complexFadeAnimation !== "undefined" ? {
            name: "complexFade",
            values: complexFadeAnimation
        } as FadeAnimation : undefined;

        if (typeof fontsize !== "undefined") {
            fontDescriptor.fontsize = ruleOfThree(this.playerResY, this.canvas.height) * parseFloat(fontsize) / 100;
        }
        if (typeof fontname !== "undefined") {
            fontDescriptor.fontname = fontname;
        }
        if (typeof bold !== "undefined") {
            fontDescriptor.bold = bold;
        }
        if (typeof italic !== "undefined") {
            fontDescriptor.italic = italic;
        }
        if (typeof underline !== "undefined") {
            fontDescriptor.underline = underline;
        }
        if (typeof strikeOut !== "undefined") {
            fontDescriptor.strikeout = strikeOut;
        }

        // console.debug("new Font", `${fontDescriptor.bold ? "bold" : ""} ${fontDescriptor.italic ? "italic" : ""}  ${fontDescriptor.fontsize}px ${fontDescriptor.fontname}`)

        return {
            tweaked,
            primaryColor,
            secondaryColor,
            outlineColor,
            shadowColor,
            scaleX,
            scaleY,
            spacing,
            angle,
            borderStyle,
            outline,
            shadow,
            alignment,
            position,
            fontDescriptor,
            custompositioning: typeof position !== 'undefined' ? true : false,
            fadeAnimation
        }
    }

    drawText(
        text: string, 
        textAlign: CanvasTextAlign, 
        textBaseline: CanvasTextBaseline,
        marginL: number,
        marginV: number,
        marginR: number,
        ) {
        let lines = text.split("\\N");
        let lineHeights = lines.map(line => this.ctx.measureText(line).actualBoundingBoxAscent + this.ctx.measureText(line).actualBoundingBoxDescent);
        let lineHeight = Math.max(...lineHeights);
        let totalHeight = lineHeight * lines.length;
        let y = 0;
        switch (textBaseline) {
            case "top":
                y = marginV + lineHeight;
                // if (lines.length > 1) { y -= totalHeight / lines.length; }
                break;
            case "middle":
                y = (this.canvas.height - totalHeight) / 2 + lineHeight;
                break;
            case "bottom":
                y = this.canvas.height - marginV;
                if (lines.length === 1) { y -= lineHeight; } else { y -= totalHeight / lines.length; }
                break;
            default:
                y = marginV + lineHeight;
                break;
        }

        lines.forEach(line => {
            let lineWidth = this.ctx.measureText(line).width;
            let x = 0;
            switch (textAlign) {
                case "left":
                    x = marginL;
                    break;
                case "center":
                    x = (this.canvas.width - lineWidth) / 2;
                    break;
                case "right":
                    x = this.canvas.width - marginR - lineWidth;
                    break;
                default:
                    x = marginL;
                    break;
            }
            if (this.ctx.lineWidth > 0) {
                // console.debug("strokeText", lineWidth);
                this.ctx.strokeText(line, x, y);
            }
            this.ctx.fillText(line, x, y);
            y += lineHeight
        })

        this.ctx.lineWidth = 0;
    }

    drawTextAtPosition(
        text: string,
        position: [number, number],
        textAlign: CanvasTextAlign,
        textBaseline: CanvasTextBaseline,
    ) {
        let lines = text.split("\\N");
        let lineHeights = lines.map(line => this.ctx.measureText(line).actualBoundingBoxAscent + this.ctx.measureText(line).actualBoundingBoxDescent);
        let lineHeight = Math.max(...lineHeights);
        let totalHeight = lineHeight * lines.length;
        let y = 0;
        switch (textBaseline) {
            case "top":
                y = position[1] + lineHeight;
                if (lines.length > 1) { y -= totalHeight / lines.length; }
                break;
            case "middle":
                y = position[1] - totalHeight / 2 + lineHeight;
                break;
            case "bottom":
                y = position[1] - lineHeight;
                break;
            default:
                y = position[1] + lineHeight;
                break;
        }

        lines.forEach(line => {
            let lineWidth = this.ctx.measureText(line).width;
            let x = 0;
            switch (textAlign) {
                case "left":
                    x = position[0];
                    break;
                case "center":
                    x = position[0] - lineWidth / 2;
                    break;
                case "right":
                    x = position[0] - lineWidth;
                    break;
                default:
                    x = position[0];
                    break;
            }
            if (this.ctx.lineWidth > 0) {
                // console.debug("strokeText", lineWidth);
                this.ctx.strokeText(line, x, y);
            }
            this.ctx.fillText(line, x, y);
            // TODO: add line spacing
            y += lineHeight + this.ctx.lineWidth;
        })

        this.ctx.lineWidth = 0;
    }

    getAlignment(alignment: number) {
        // 1 = (bottom) left
        // 2 = (bottom) center
        // 3 = (bottom) right
        // 4 = (middle) left
        // 5 = (middle) center
        // 6 = (middle) right
        // 7 = (top) left
        // 8 = (top) center
        // 9 = (top) right
        switch (alignment) {
            case 1:
            case 4:
            case 7:
                return "left";
            case 2:
            case 5:
            case 8:
                return "center";
            case 3:
            case 6:
            case 9:
                return "right";
            default:
                return "start";
        }
    }

    getBaseLine(alignment: number) {
        // 1 = (bottom) left
        // 2 = (bottom) center
        // 3 = (bottom) right
        // 4 = (middle) left
        // 5 = (middle) center
        // 6 = (middle) right
        // 7 = (top) left
        // 8 = (top) center
        // 9 = (top) right
        switch (alignment) {
            case 1:
            case 2:
            case 3:
                return "bottom";
            case 4:
            case 5:
            case 6:
                return "middle";
            case 7:
            case 8:
            case 9:
                return "top";
            default:
                return "alphabetic";
        }
    }

    getStyle(styleName: string) {return this.styles.find(style => style.Name === styleName)}

    getFontDescriptor(style: SingleStyle): FontDescriptor {
        const fontsize = ruleOfThree(this.playerResY, this.canvas.height) * parseFloat(style.Fontsize) / 100;
        return {
            fontname: style.Fontname,
            fontsize: fontsize,
            bold: style.Bold === "-1",
            italic: style.Italic === "-1",
            underline: style.Underline === "-1",
            strikeout: style.StrikeOut === "-1",
        };
    }
}
