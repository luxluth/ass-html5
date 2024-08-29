import type { CompiledASSStyle, Dialogue } from 'ass-compiler';
import type { CompiledTag, ParsedTag } from 'ass-compiler/types/tags';
import { Vector2 } from './utils';

export type OnInitSizes = {
  width: number;
  height: number;
  x: number;
  y: number;
};

export enum Baseline {
  Bottom,
  Middle,
  Top,
  Alphabetic
}

export enum Align {
  Left,
  Center,
  Right,
  Start
}

export type CustomAnimation = {
  t1: number;
  t2: number;
  accel: number;
  tag: CompiledTag;
};

export type StyleDescriptor = {
  fontname: string;
  fontsize: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikeout: boolean;
  colors: Colors;
  /** font transformation */
  t: FontTransfomation;
  customAnimations: CustomAnimation[];
  /** x border */
  xbord: number;
  /** y border */
  ybord: number;
  xshad: number;
  yshad: number;
  /** shadow blur */
  blur: number;
  /** font encoding */
  fe?: number;
  borderStyle: number;
  opacity: number;
  textAlign: Align;
  textBaseline: Baseline;
};

export type Layer = {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
};

export type Colors = {
  c1: string;
  a1: number;
  c2: string;
  a2: number;
  c3: string;
  a3: number;
  c4: string;
  a4: number;
};

export type FontTransfomation = {
  /** font scale x */
  fscx: number;
  /** font scale y */
  fscy: number;
  /** font rotation z*/
  frz: number;
  /** font rotation x*/
  frx: number;
  /** font rotation y*/
  fry: number;
  /** font shear x */
  fax?: number;
  /** font shear y */
  fay?: number;
  /** font spacing */
  fsp: number;
  /** wrap style */
  q: 0 | 2 | 1 | 3;
};

export type Tag = { [K in keyof ParsedTag]: ParsedTag[K] };

export type Override = {
  dialogue: Dialogue;
  style: CompiledASSStyle;
};

export type Styles = { [styleName: string]: CompiledASSStyle };

export type Position = {
  x: number;
  y: number;
};

export type LOGTYPE = 'DISABLE' | 'VERBOSE' | 'DEBUG' | 'WARN';

export enum CHARKIND {
  NEWLINE,
  NORMAL
}

export type Margin = { left: number; right: number; vertical: number };
export type Char =
  | {
      kind: CHARKIND.NORMAL;
      pos: Vector2;
      c: string;
      w: number;
      tag: CompiledTag;
      style: string;
      ord: number;
    }
  | {
      kind: CHARKIND.NEWLINE;
    };

export type Word = {
  w: number;
  font: StyleDescriptor;
  value: Char[];
};

export enum FadeKind {
  Simple,
  Complex
}
export type FadeAnimation =
  | {
      type: FadeKind.Simple;
      fadein: number;
      fadeout: number;
    }
  | {
      type: FadeKind.Complex;
      a1: number;
      a2: number;
      a3: number;
      t1: number;
      t2: number;
      t3: number;
      t4: number;
    };
