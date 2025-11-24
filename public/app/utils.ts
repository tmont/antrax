import type { ColorPalette } from './ColorPalette.ts';

export const nope = (_x: never) => {};

// https://stackoverflow.com/a/49286056
export type ValueOf<T> = T[keyof T];

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
export type ColorIndex = 0 | 1 | 2;

const paletteIndexMap: Record<PaletteIndex, 1> = { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1 };
const colorIndexMap: Record<ColorIndex, 1> = { 0: 1, 1: 1, 2: 1 };
export const isPaletteIndex = (index: number): index is PaletteIndex => !!paletteIndexMap[index as PaletteIndex];
export const isPaletteColorIndex = (index: number): index is ColorIndex => !!colorIndexMap[index as ColorIndex];

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

export interface DisplayModeColorValue {
    colors: DisplayModeColor[];
    kangarooModeOnly?: boolean;
}

export type DisplayModeColorValueSerialized = DisplayModeColorIndex;

export interface PixelInfo {
    modeColorIndex: DisplayModeColorIndex | null; // "null" indicates there is no data for that pixel
}
export type PixelInfoSerialized = PixelInfo;

export const getColorValueCombinedLabel = (value: DisplayModeColorValue): string =>
    value.colors.map(x => x.label).join('+');

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

export const findElement = (ancestor: ParentNode, selector: string): HTMLElement =>
    findOrDie(ancestor, selector, node => node instanceof HTMLElement);
export const findInput = (ancestor: ParentNode, selector: string): HTMLInputElement =>
    findOrDie(ancestor, selector, node => node instanceof HTMLInputElement);
export const findSelect = (ancestor: ParentNode, selector: string): HTMLSelectElement =>
    findOrDie(ancestor, selector, node => node instanceof HTMLSelectElement);
export const findImage = (ancestor: ParentNode, selector: string): HTMLImageElement =>
    findOrDie(ancestor, selector, node => node instanceof HTMLImageElement);
export const findTemplateContent = (ancestor: ParentNode, selector: string): DocumentFragment =>
    findOrDie(ancestor, selector, node => node instanceof HTMLTemplateElement).content;

export type AssemblyNumberFormatRadix = 2 | 10 | 16;
export const formatAssemblyNumber = (value: number, radix: AssemblyNumberFormatRadix): string => {
    switch (radix) {
        case 16:
            return '$' + zeroPad((value.toString(16)).toUpperCase(), 2);
        case 10:
            return value.toString();
        case 2: {
            const bin = value.toString(2);
            return '%' + zeroPad(value.toString(2), bin.length + ((8 - (bin.length % 8)) % 8));
        }
        default:
            nope(radix);
            return value.toString();
    }
};

export const zeroPad = (x: string, len: number): string => x.padStart(len, '0');

export const isLeftMouseButton = (e: MouseEvent): boolean => e.button === 0;

export type DrawMode =
    'draw' | 'erase' | 'fill' | 'dropper' |
    'rect' | 'rect-filled' |
    'ellipse' | 'ellipse-filled' |
    'line';
const drawModeMap: Record<DrawMode, 1> = {
    ellipse: 1, 'ellipse-filled': 1, draw: 1, erase: 1, dropper: 1, fill: 1, line: 1, rect: 1, 'rect-filled': 1,
};
export const isDrawMode = (mode: unknown): mode is DrawMode =>
    typeof mode === 'string' && !!drawModeMap[mode as unknown as DrawMode];

export const hasMessage = (obj: unknown): obj is { message: string } =>
    typeof obj === 'object' && !!obj && typeof (obj as any).message === 'string';

export const get2dContext = (canvas: HTMLCanvasElement): CanvasRenderingContext2D => {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error(`Failed to get 2d context for canvas`);
    }

    return ctx;
};

export const CodeGenerationDetailLevel = {
    None: 0,
    Some: 5,
    Lots: 10,
} as const;

export interface CodeGenerationOptionsBase {
    indentChar: string;
    labelColon: boolean;
    addressOffsetRadix: AssemblyNumberFormatRadix;
    byteRadix: AssemblyNumberFormatRadix;
    object: boolean;
    header: boolean;
    commentLevel: ValueOf<typeof CodeGenerationDetailLevel>;
    padToHeight?: number;
}

export interface CodeGenerationOptionsLabel extends CodeGenerationOptionsBase {
    addressLabel: string;
}

export interface CodeGenerationOptionsOffset extends CodeGenerationOptionsBase {
    addressOffset: number;
}

export type CodeGenerationOptions = CodeGenerationOptionsLabel | CodeGenerationOptionsOffset;

export const hasAddressLabel = (options: CodeGenerationOptions): options is CodeGenerationOptionsLabel => {
    return !!((options as CodeGenerationOptionsLabel).addressLabel || '').trim();
};

const idArr = new Uint32Array(2);
export const generateId = (): string => Array.from(crypto.getRandomValues(idArr))
    .map(i32 => i32.toString(36))
    .join('_');

// https://stackoverflow.com/a/13139830
export const emptyGif = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

export type SiblingInsertOrder = 'before' | 'after';
