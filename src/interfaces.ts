import { Dialogue } from 'ass-compiler'
import { Renderer } from './renderer'
import { FontDescriptor, Styles } from './types'

export interface DrawingStrategy {
	renderer: Renderer
	dialogue: Dialogue
	styles: Styles
	draw(): void
}
