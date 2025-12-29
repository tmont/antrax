import { ColorPalette } from './ColorPalette.ts';
import type { ColorPaletteSet } from './ColorPaletteSet.ts';
import type { ColorPaletteType } from './colors.ts';
import type { EditorSettings } from './Editor.ts';
import {
    type PaletteColorIndex,
    type Dimensions,
    type DisplayModeColor,
    type DisplayModeColorString,
    type DisplayModeColorValue,
    type DisplayModeName,
    isPaletteColorIndex,
    isPaletteIndex,
    nope,
    type PaletteIndex,
    type PixelInfo
} from './utils.ts';

const colorCountMap: Readonly<Record<DisplayModeName, number>> = {
    none: 25,
    '160A': 4,
    '160B': 13,
    '320A': 4,
    '320B': 16,
    '320C': 13,
    '320D': 4,
};

class DisplayMode {
    public static readonly ModeNone = new DisplayMode('none');
    public static readonly Mode160A = new DisplayMode('160A');
    public static readonly Mode160B = new DisplayMode('160B');
    public static readonly Mode320A = new DisplayMode('320A');
    public static readonly Mode320B = new DisplayMode('320B');
    public static readonly Mode320C = new DisplayMode('320C');
    public static readonly Mode320D = new DisplayMode('320D');

    public static readonly encodedWidthBits = 5;

    private constructor(public readonly name: DisplayModeName) {}

    public static create(name: DisplayModeName): DisplayMode {
        switch (name) {
            case 'none': return DisplayMode.ModeNone;
            case '160A': return DisplayMode.Mode160A;
            case '160B': return DisplayMode.Mode160B;
            case '320A': return DisplayMode.Mode320A;
            case '320B': return DisplayMode.Mode320B;
            case '320C': return DisplayMode.Mode320C;
            case '320D': return DisplayMode.Mode320D;
            default:
                nope(name);
                throw new Error(`Unknown display mode name "${name}"`);
        }
    }

    public static isValidName(name: string): name is DisplayModeName {
        const typedName = name as DisplayModeName;
        switch (typedName) {
            case 'none':
            case '160A':
            case '160B':
            case '320A':
            case '320B':
            case '320C':
            case '320D':
                return true;
            default:
                nope(typedName);
                return false;
        }
    }

    public get hasSinglePalette(): boolean {
        switch (this.name) {
            case 'none':
                return false;
            case '160A':
            case '160B':
            case '320A':
            case '320B':
            case '320C':
            case '320D':
                return true;
            default:
                nope(this.name);
                throw new Error(`Invalid type "${this.name}"`);
        }
    }

    public get colorPaletteType(): ColorPaletteType {
        switch (this.name) {
            case 'none':
                return 'rgb';
            case '160A':
            case '160B':
            case '320A':
            case '320B':
            case '320C':
            case '320D':
                return 'atari7800';
            default:
                nope(this.name);
                throw new Error(`Invalid type "${this.name}"`);
        }
    }

    public get maxWidth(): number {
        switch (this.name) {
            case 'none':
                return Infinity;
            case '160A':
            case '160B':
            case '320A':
            case '320B':
            case '320C':
            case '320D':
                return this.pixelsPerByte * (2 ** DisplayMode.encodedWidthBits);
            default:
                nope(this.name);
                throw new Error(`Invalid type "${this.name}"`);
        }
    }

    public get pixelsPerByte(): number {
        switch (this.name) {
            case 'none':
                return -1;
            case '160A':
                return 4;
            case '160B':
                return 2;
            case '320A':
            case '320D':
                return 4;
            case '320B':
            case '320C':
                return 2;
            default:
                nope(this.name);
                throw new Error(`Invalid type "${this.name}"`);
        }
    }

    public get readMode(): number {
        switch (this.name) {
            case 'none':
                return -1;
            case '160A':
            case '160B':
                return 0;
            case '320A':
            case '320C':
                return 3;
            case '320B':
            case '320D':
                return 2;
            default:
                nope(this.name);
                throw new Error(`Invalid type "${this.name}"`);
        }
    }

    public get writeMode(): number {
        switch (this.name) {
            case 'none':
                return -1;
            case '160A':
            case '320A':
            case '320D':
                return 0;
            case '160B':
            case '320B':
            case '320C':
                return 1;
            default:
                nope(this.name);
                throw new Error(`Invalid type "${this.name}"`);
        }
    }

    public get partsPerPixel(): number {
        switch (this.name) {
            case 'none':
            case '160A':
            case '160B':
                return 1;
            case '320A':
            case '320B':
            case '320C':
            case '320D':
                return 2;
            default:
                nope(this.name);
                throw new Error(`Invalid type "${this.name}"`);
        }
    }

    public getPixelDimensions(defaults: Dimensions): Dimensions {
        switch (this.name) {
            case 'none':
                return defaults;
            case '160A':
            case '160B':
            case '320A':
            case '320B':
            case '320C':
            case '320D':
                return {
                    width: 12,
                    height: 7.
                };
            default:
                nope(this.name);
                throw new Error(`Invalid type "${this.name}"`);
        }
    }

    public get isFixedPixelSize(): boolean {
        switch (this.name) {
            case 'none':
                return false;
            case '160A':
            case '160B':
            case '320A':
            case '320B':
            case '320C':
            case '320D':
                return true;
            default:
                nope(this.name);
                throw new Error(`Invalid type "${this.name}"`);
        }
    }

    public get canExportToASM(): boolean {
        switch (this.name) {
            case 'none':
                return false;
            case '160A':
            case '160B':
            case '320A':
            case '320B':
            case '320C':
            case '320D':
                return true;
            default:
                nope(this.name);
                throw new Error(`Invalid type "${this.name}"`);
        }
    }

    public get supportsKangarooMode(): boolean {
        switch (this.name) {
            case 'none':
                return false;
            case '160A':
            case '160B':
            case '320A':
            case '320B':
            case '320C':
            case '320D':
                return true;
            default:
                nope(this.name);
                throw new Error(`Invalid type "${this.name}"`);
        }
    }

    public get supportsHorizontalFlip(): boolean {
        switch (this.name) {
            case 'none':
            case '160A':
            case '160B':
            case '320A':
            case '320B':
            case '320C':
                return true;
            case '320D':
                return false;
            default:
                nope(this.name);
                throw new Error(`Invalid type "${this.name}"`);
        }
    }

    public static getNumColors(): Readonly<Record<DisplayModeName, number>> {
        return colorCountMap;
    }

    public get numColors(): number {
        return colorCountMap[this.name];
    }

    /**
     * @return {number[]} Mapping from the current mode color index to the reflected one
     */
    public getReflectedColorMapping(colors: DisplayModeColorValue[]): number[] {
        const expectedColorCount = this.numColors;
        switch (this.name) {
            case 'none':
            case '160A':
            case '160B':
                return colors.map((_, i) => i); // identity mapping
            case '320A':
                if (colors.length !== expectedColorCount) {
                    throw new Error(`expected mode ${this.name} to have exactly ${expectedColorCount} colors`);
                }
                return [ 0, 2, 1, 3 ];
            case '320B':
                if (colors.length !== expectedColorCount) {
                    throw new Error(`expected mode ${this.name} to have exactly ${expectedColorCount} colors`);
                }
                return [ 0, 2, 1, 3, 8, 10, 9, 11, 4, 6, 5, 7, 12, 14, 13, 15 ];
            case '320C':
                if (colors.length !== expectedColorCount) {
                    throw new Error(`expected mode ${this.name} to have exactly ${expectedColorCount} colors`);
                }
                return [
                    0, 2, 1, 3,
                    5, 4, 6,
                    8, 7, 9,
                    11, 10, 12
                ];
            case '320D':
                throw new Error(`${this.name} does not support reflection`);
            default:
                nope(this.name);
                throw new Error(`Invalid type "${this.name}"`);
        }
    }

    public getColorAt(
        paletteSet: ColorPaletteSet,
        palette: ColorPalette,
        index: number,
        kangarooMode: EditorSettings['kangarooMode'],
    ): DisplayModeColorValue | null {
        const colors = this.getColors(paletteSet, palette, kangarooMode);
        return colors[index] || null;
    }

    private getColorValuesForPalette(
        paletteIndex: PaletteIndex,
        palettes: ColorPalette[],
        mask: number,
    ): [ DisplayModeColor, DisplayModeColor, DisplayModeColor ] {
        const effectiveIndex = paletteIndex & mask;
        if (!isPaletteIndex(effectiveIndex)) {
            throw new Error(`Invalid mask 0b${mask.toString(2)} for palette`);
        }
        const effectivePalette: ColorPalette = palettes[effectiveIndex]!;

        const colorIndexes: [ PaletteColorIndex, PaletteColorIndex, PaletteColorIndex ] = [ 0, 1, 2 ];
        return colorIndexes
            .map((colorIndex) => {
                const key: DisplayModeColorString = `P${effectiveIndex}C${colorIndex}`;
                const color: DisplayModeColor = {
                    label: key,
                    value: {
                        palette: effectivePalette,
                        index: colorIndex,
                    },
                };
                return color;
            }) as [ DisplayModeColor, DisplayModeColor, DisplayModeColor ];
    }

    public getColors(
        paletteSet: ColorPaletteSet,
        palette: ColorPalette,
        kangarooMode: EditorSettings['kangarooMode'],
    ): DisplayModeColorValue[] {
        const paletteIndex = paletteSet.getPalettes().indexOf(palette);
        if (!isPaletteIndex(paletteIndex)) {
            throw new Error(`ColorPalette{${palette.id}} not found in ColorPaletteSet{${paletteSet.id}}`);
        }

        const palettes = paletteSet.getPalettes();

        const t: DisplayModeColor = {
            label: 'T',
            value: 'transparent',
        };

        const bg: DisplayModeColor = {
            label: 'BG',
            value: 'background',
        };

        const [ c1, c2, c3 ] = this.getColorValuesForPalette(paletteIndex, palettes, 0b111);

        const mapPalette = (palette: ColorPalette, paletteIndex: PaletteIndex): DisplayModeColorValue[] => {
            return palette.colors.map((_, index): DisplayModeColorValue => {
                if (!isPaletteColorIndex(index)) {
                    throw new Error(`Cannot handle color index ${index}`);
                }

                return {
                    colors: [ {
                        label: `P${paletteIndex}C${index}`,
                        value: {
                            palette,
                            index,
                        },
                    } ],
                }
            });
        };

        switch (this.name) {
            case 'none':
                return [ { colors: [ t ] }, { colors: [ bg ] } ].concat(
                    palettes
                        .map((palette, i) => {
                            if (!isPaletteIndex(i)) {
                                throw new Error();
                            }

                            return mapPalette(palette, i);
                        })
                        .reduce((arr, colors) => arr.concat(colors), [])
                );
            case '160A':
                return [
                    { colors: [ kangarooMode ? bg : t ] },
                    { colors: [ c1 ] },
                    { colors: [ c2 ] },
                    { colors: [ c3 ] },
                ];
            case '160B': {
                const mask = 0b100;
                const startIndex: 0 | 4 = (paletteIndex & mask) as any;
                return [ { colors: [ kangarooMode ? bg : t ] } ].concat(
                    palettes
                        .slice(startIndex, startIndex + mask)
                        .map((palette, i) => {
                            const paletteIndex = startIndex + i;
                            if (!isPaletteIndex(paletteIndex)) {
                                throw new Error();
                            }

                            return mapPalette(palette, paletteIndex);
                        })
                        .reduce((arr, colors) => arr.concat(colors), [])
                );
            }
            case '320A':
                return [
                    { colors: [ kangarooMode ? bg : t , kangarooMode ? bg : t ] },
                    { colors: [ bg, c2 ] },
                    { colors: [ c2, bg ] },
                    { colors: [ c2, c2 ] },
                ];
            case '320B': {
                const [ c1, c2, c3 ] = this.getColorValuesForPalette(paletteIndex, palettes, 0b100);

                // note: these are reordered from the tables so that they are in bit order
                return [
                    { colors: [ kangarooMode ? bg : t, kangarooMode ? bg : t ] },

                    { colors: [ kangarooMode ? bg : t, kangarooMode ? c1  : t] },
                    { colors: [ kangarooMode ? c1 : t, kangarooMode ? bg : t ] },
                    { colors: [ kangarooMode ? c1 : t, kangarooMode ? c1 : t ] },

                    { colors: [ bg, c2 ] }, // 01..00
                    { colors: [ bg, c3 ] }, // 01..01
                    { colors: [ c1, c2 ] }, // 01..10
                    { colors: [ c1, c3 ] }, // 01..11

                    { colors: [ c2, bg ] }, // 10..00
                    { colors: [ c2, c1 ] }, // 10..01
                    { colors: [ c3, bg ] }, // 10..10
                    { colors: [ c3, c1 ] }, // 10..11

                    { colors: [ c2, c2 ] }, // 11..00
                    { colors: [ c2, c3 ] }, // 11..01
                    { colors: [ c3, c2 ] }, // 11..10
                    { colors: [ c3, c3 ] }, // 11..11
                ];
            }
            case '320C': {
                const mask = 0b100;
                const startIndex: 0 | 4 = (paletteIndex & mask) as any;

                return [ { colors: [ kangarooMode ? bg : t, kangarooMode ? bg : t ] } ].concat(
                    palettes
                        .slice(startIndex, startIndex + mask)
                        .map((palette, i) => {
                            const paletteIndex = startIndex + i;
                            if (!isPaletteIndex(paletteIndex)) {
                                throw new Error();
                            }

                            const c2: DisplayModeColor = {
                                label: `P${paletteIndex}C1`,
                                value: {
                                    index: 1,
                                    palette,
                                },
                            };

                            return [
                                { colors: [ bg, c2 ] },
                                { colors: [ c2, bg ] },
                                { colors: [ c2, c2 ] },
                            ];
                        })
                        .reduce((arr, colors) => arr.concat(colors), [])
                );
            }
            case '320D': {
                const [ c1, c2, c3 ] = this.getColorValuesForPalette(paletteIndex, palettes, 0b100);

                switch (paletteIndex) {
                    case 0:
                    case 4:
                        return [
                            { colors: [ kangarooMode ? bg : t, kangarooMode ? bg : t ] },
                            { colors: [ bg, c2 ] },
                            { colors: [ c2, bg ] },
                            { colors: [ c2, c2 ] },
                        ];
                    case 1:
                    case 5:
                        return [
                            { colors: [ kangarooMode ? bg : t, kangarooMode ? c1 : t ] },
                            { colors: [ bg, c3 ] },
                            { colors: [ c2, c1 ] },
                            { colors: [ c2, c3 ] },
                        ];
                    case 2:
                    case 6:
                        return [
                            { colors: [ kangarooMode ? c1 : t, kangarooMode ? bg : t ] },
                            { colors: [ c1, c2 ] },
                            { colors: [ c3, bg ] },
                            { colors: [ c3, c2 ] },
                        ];
                    case 3:
                    case 7:
                        return [
                            { colors: [ kangarooMode ? c1 : t, kangarooMode ? c1 : t ] },
                            { colors: [ c1, c3 ] },
                            { colors: [ c3, c1 ] },
                            { colors: [ c3, c3 ] },
                        ];
                    default:
                        nope(paletteIndex);
                        throw new Error(`invalid palette index "${paletteIndex}"`);
                }
            }
            default:
                nope(this.name);
                throw new Error(`Invalid type "${this.name}"`);
        }
    }

    public convertPixelsToBytes(pixels: PixelInfo[]): number[] {
        const bytes: number[] = [];
        const pixelsPerByte = this.pixelsPerByte;
        if (pixels.length % pixelsPerByte !== 0) {
            throw new Error(`width is not a multiple of ${pixelsPerByte} (${pixels.length})`);
        }

        for (let i = 0; i < pixels.length; i += pixelsPerByte) {
            const chunk = pixels.slice(i, i + pixelsPerByte);

            switch (this.name) {
                case 'none':
                    throw new Error(`display mode "${this.name}" cannot be exported`);
                case '160A':
                case '320A':
                case '320D': {
                    // https://sites.google.com/site/atari7800wiki/graphics-modes/palette-sprite-bits/160a
                    // https://sites.google.com/site/atari7800wiki/graphics-modes/palette-sprite-bits/320a
                    // https://sites.google.com/site/atari7800wiki/graphics-modes/palette-sprite-bits/320d
                    const byte = chunk
                        .map((pixel, i) => {
                            const index = (pixel.modeColorIndex || 0) % 4;
                            return index << (6 - (i * 2));
                        })
                        .reduce((result, value) => result | value, 0);
                    bytes.push(byte);
                    break;
                }
                case '160B':
                case '320C': {
                    // https://sites.google.com/site/atari7800wiki/graphics-modes/palette-sprite-bits/160b
                    // https://sites.google.com/site/atari7800wiki/graphics-modes/palette-sprite-bits/320c
                    const byte = chunk
                        .map((pixel, i) => {
                            let index = pixel.modeColorIndex || 0;
                            if (index === 0) {
                                return 0;
                            }

                            // we don't present the other three transparent options ever
                            index += 3;

                            const hi = (((index - 1) % 3) + 1) << 4;
                            const lo = Math.floor((index - 4) / 3);

                            return (hi | lo) << (2 - (i * 2));
                        })
                        .reduce((result, value) => result | value, 0);
                    bytes.push(byte);
                    break;
                }
                case '320B': {
                    // https://sites.google.com/site/atari7800wiki/graphics-modes/palette-sprite-bits/320b
                    const byte = chunk
                        .map((pixel, i) => {
                            const index = pixel.modeColorIndex || 0;

                            const hi = Math.floor(index / 4) << 4;
                            const lo = index % 4;

                            return (hi | lo) << (2 - (i * 2));
                        })
                        .reduce((result, value) => result | value, 0);
                    bytes.push(byte);
                    break;
                }
                default:
                    nope(this.name);
                    throw new Error(`invalid name "${this.name}"`);
            }
        }

        return bytes;
    }
}

export default DisplayMode;
