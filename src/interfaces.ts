import { Dialogue } from 'ass-compiler'
import { Renderer } from './renderer'
import { FontDescriptor, Styles } from './types'

export abstract class DrawingStrategy {
    constructor(renderer: Renderer, dialogue: Dialogue, styles: Styles, font: FontDescriptor) {};
	draw() {}
}
