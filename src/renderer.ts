import type { ParsedASS, ParsedASSEventText } from "ass-compiler";
import { SingleStyle, FontDescriptor, Tag } from "./types";
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
        // let data = [
        //     {parsedAss : this.parsedAss},
        //     {canvas : this.canvas},
        //     {ctx : this.ctx}
        // ]
        // console.debug(data)
    }

    render() {
        this.video.addEventListener('timeupdate', () => {
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
            const { Style, Text } = event;
            const style = this.getStyle(Style);
            if (style === undefined) { return; }
            this.showText(Text, style);
        });
    }

    /*
    type SingleStyle = {
        Name: string;
        Fontname: string;
        Fontsize: string;
        PrimaryColour: string;
        SecondaryColour: string;
        OutlineColour: string;
        BackColour: string;
        Bold: string;
        Italic: string;
        Underline: string;
        StrikeOut: string;
        ScaleX: string;
        ScaleY: string;
        Spacing: string;
        Angle: string;
        BorderStyle: string;
        Outline: string;
        Shadow: string;
        Alignment: string;
        MarginL: string;
        MarginR: string;
        MarginV: string;
        Encoding: string;
    }
    */

    showText(Text: ParsedASSEventText, style: SingleStyle) {
        // console.debug(style.Name, Text)
        let fontDescriptor = this.getFontDescriptor(style) // FontDescriptor
        let c1 = convertAegisubToRGBA(style.PrimaryColour) // primary color
        let c2 = convertAegisubToRGBA(style.SecondaryColour) // secondary color
        let c3 = convertAegisubToRGBA(style.OutlineColour) // outline color
        let c4 = convertAegisubToRGBA(style.BackColour) // shadow color
        let marginL = ruleOfThree(this.playerResX, this.canvas.width) * parseFloat(style.MarginL) / 100
        let marginV = ruleOfThree(this.playerResY, this.canvas.height) * parseFloat(style.MarginV) / 100
        let marginR = ruleOfThree(this.playerResX, this.canvas.width) * parseFloat(style.MarginR) / 100
        // console.debug(marginL, marginV, marginR)
        const text = Text.parsed[0]?.text as string
        const tags = Text.parsed[0]?.tags as Tag[]

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

        this.teawksDrawSettings(text, tags, textAlign, textBaseline, marginL, marginV, marginR, fontDescriptor);

        this.drawText(text, textAlign, textBaseline, marginL, marginV, marginR);
    }

    teawksDrawSettings(
        text: string,
        tags: Tag[],
        textAlign: CanvasTextAlign,
        textBaseline: CanvasTextBaseline,
        marginL: number,
        marginV: number,
        marginR: number,
        fontDescriptor: FontDescriptor
    ) {
        // console.debug("tags", tags)
        // put all the tags in the same object
        let tagsObject = {};
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
                if (lines.length > 1) { y -= totalHeight / lines.length; }
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
            this.ctx.strokeText(line, x, y);
            this.ctx.fillText(line, x, y);
            y += lineHeight;
        })
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
