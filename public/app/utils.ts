import type { ColorIndex, ColorPalette } from './ColorPalette.ts';
import type { Atari7800Color } from './colors.ts';

export const nope = (_x: never) => {};

export interface Dimensions {
    width: number;
    height: number;
}

export interface Coordinate {
    x: number;
    y: number;
}

export type PixelColor = Atari7800Color | null;

export interface PixelInfoColor {
    palette: Readonly<ColorPalette>;
    index: ColorIndex;
}

export interface PixelInfoBg {
    palette: null;
    index: null;
}

export type PixelInfo = PixelInfoColor | PixelInfoBg;

const parser = new DOMParser();
export const parseTemplate = (html: string): HTMLElement => {
    const el = parser.parseFromString(html, 'text/html').body.firstChild;
    if (!el) {
        throw new Error('Failed to parse HTML template');
    }

    return el as HTMLElement;
};

export const findOrDie = <T>(ancestor: ParentNode, selector: string, predicate: (node: unknown) => node is T): T => {
    const child = ancestor.querySelector(selector);
    if (!predicate(child)) {
        throw new Error(`Unable to find ${selector}`);
    }

    return child;
};

export const findElement = (ancestor: ParentNode, selector: string): HTMLElement => {
    return findOrDie(ancestor, selector, node => node instanceof HTMLElement);
};
