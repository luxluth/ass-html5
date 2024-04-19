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

export type FontDescriptor = {
  fontname: string;
  fontsize: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikeout: boolean;
  colors: Colors;
  /** font transformation */
  t: FontTransfomation;
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

export declare namespace ASSAnimation {
  export type Fade =
    | {
        name: 'fad';
        /**
         * The values of the fade animation
         * `\fad(<fadein>,<fadeout>)` or `\fade(<a1>,<a2>,<a3>,<t1>,<t2>,<t3>,<t4>)`
         */
        values: FadValues;
      }
    | {
        name: 'fade';
        values: FadeValues;
      };

  export type FadeValues = [number, number, number, number, number, number, number];
  export type FadValues = [number, number];

  export type MoveValues = MoveValuesSimple | MoveValuesComplex;

  export type MoveValuesSimple = [number, number, number, number];
  export type MoveValuesComplex = [number, number, number, number, number, number];

  export type Move = {
    name: 'move';
    /**
     * The values of the move animation
     * `\move(<x1>,<y1>,<x2>,<y2>)` or `\move(<x1>,<y1>,<x2>,<y2>,<t1>,<t2>)`
     */
    values: MoveValues;
  };

  export type Org = {
    name: 'org';
    /**
     * The values of the Rotation origin animation
     * `\org(<x>,<y>)`
     */
    values: OrgValues;
  };

  export type OrgValues = [number, number];

  export type Animation = Fade | Move | Org;
}

export type Override = {
  dialogue: Dialogue;
  style: CompiledASSStyle;
};

export type Styles = { [styleName: string]: CompiledASSStyle };

export type Position = {
  x: number;
  y: number;
};

export enum LOGTYPE {
  DISABLE = 'DISABLE',
  VERBOSE = 'VERBOSE',
  DEBUG = 'DEBUG',
  WARN = 'WARN'
}

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
  value: Char[];
};
