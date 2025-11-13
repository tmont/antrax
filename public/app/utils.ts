import type { ColorIndex, ColorPalette } from './ColorPalette.ts';

export const nope = (_x: never) => {};

export interface Dimensions {
    width: number;
    height: number;
}

export interface Coordinate {
    x: number;
    y: number;
}

export type DisplayModeNameLo = '160A' | '160B';
export type DisplayModeNameHi = '320A' | '320B' | '320C' | '320D';
export type DisplayModeName = DisplayModeNameLo | DisplayModeNameHi | 'none';
export type PaletteIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export const isPaletteIndex = (index: number): index is PaletteIndex => index >= 0 && index <= 7;

export interface ColorPaletteColor {
    palette: ColorPalette;
    index: ColorIndex;
}

export type DisplayModeNonColorString = 'T' | 'BG';
export type DisplayModeColorString = `P${PaletteIndex}C${ColorIndex}`;
export type DisplayModeColorStringAll = DisplayModeNonColorString | DisplayModeColorString;
export type ColorValue = 'transparent' | 'background' | ColorPaletteColor;

export type DisplayModeColorIndex = number;

export interface DisplayModeColor {
    label: DisplayModeColorStringAll;
    value: ColorValue;
}

export type DisplayModeColorValue = DisplayModeColor[];

export type DisplayModeColorValueSerialized = DisplayModeColorIndex;

export interface PixelInfo {
    modeColorIndex: DisplayModeColorIndex | null; // "null" indicates there is no data for that pixel
}
export type PixelInfoSerialized = PixelInfo;

export const getColorValueCombinedLabel = (value: DisplayModeColorValue): string =>
    value.map(x => x.label).join('+');

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
export type AssemblyNumberFormatRadix = 2 | 10 | 16;
export const formatAssemblyNumber = (value: number, radix: AssemblyNumberFormatRadix): string => {
    switch (radix) {
        case 16:
            return '$' + (value.toString(16)).toUpperCase();
        case 10:
            return value.toString();
        case 2:
            return '%' + (0x100 | value).toString(2).substring(1);
        default:
            nope(radix);
            return value.toString();
    }
};

export const zeroPad = (x: string, len: number): string => '0'.repeat(Math.max(0, len - x.length)) + x;
