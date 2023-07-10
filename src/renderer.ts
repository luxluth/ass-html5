import type { ParsedASS } from "ass-compiler";
export class Renderer {
    parsedAss: ParsedASS
    canvas: HTMLCanvasElement
    ctx: CanvasRenderingContext2D
    constructor(parsedASS: ParsedASS, canvas: HTMLCanvasElement) {
        this.parsedAss = parsedASS
        this.canvas = canvas
        this.ctx = canvas.getContext("2d") as CanvasRenderingContext2D
        if (this.ctx === null) { throw new Error("Unable to initilize the Canvas 2D context") }
        let data = [
            {parsedAss : this.parsedAss},
            {canvas : this.canvas},
            {ctx : this.ctx}
        ]
        console.debug(data)
    }
    render() {}
    redraw() {}
}
