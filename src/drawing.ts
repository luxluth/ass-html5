import { Dialogue } from "ass-compiler";
import { DrawingStrategy } from "./interfaces";
import { Renderer } from "./renderer";
import { Styles, FontDescriptor } from "./types";

export class SimpleDrawing implements DrawingStrategy {
    constructor(renderer: Renderer, dialogue: Dialogue, styles: Styles, font: FontDescriptor) {}
    draw(): void {
        throw new Error("Method not implemented.");
    }
}

export class SpecificPositionDrawing implements DrawingStrategy {
    constructor(renderer: Renderer, dialogue: Dialogue, styles: Styles, font: FontDescriptor) { }
    draw(): void {
        throw new Error("Method not implemented.");
    }
}

export class PathDrawing implements DrawingStrategy {
    constructor(renderer: Renderer, dialogue: Dialogue, styles: Styles, font: FontDescriptor) { }
    draw(): void {
        throw new Error("Method not implemented.");
    }
}

export class AnimateDrawing implements DrawingStrategy {
    constructor(renderer: Renderer, dialogue: Dialogue, styles: Styles, font: FontDescriptor) { }
    draw(): void {
        throw new Error("Method not implemented.");
    }  
}
