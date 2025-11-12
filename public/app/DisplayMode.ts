import { type ColorIndex, ColorPalette } from './ColorPalette.ts';
import type { ColorPaletteSet } from './ColorPaletteSet.ts';
import {
    type Dimensions,
    type DisplayModeColor,
    type DisplayModeColorString,
    type DisplayModeColorValue,
    type DisplayModeName,
    isPaletteIndex,
    nope,
    type PaletteIndex,
    type PixelInfo
} from './utils.ts';

class DisplayMode {
    public static readonly ModeNone = new DisplayMode('none');
    public static readonly Mode160A = new DisplayMode('160A');
    public static readonly Mode160B = new DisplayMode('160B');
    public static readonly Mode320A = new DisplayMode('320A');
    public static readonly Mode320B = new DisplayMode('320B');
    public static readonly Mode320C = new DisplayMode('320C');
    public static readonly Mode320D = new DisplayMode('320D');

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
                return 160;
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

    public getColorAt(
        paletteSet: ColorPaletteSet,
        palette: ColorPalette,
        index: number,
    ): DisplayModeColorValue | null {
        const colors = this.getColors(paletteSet, palette);
        return colors[index] || null;
    }

    private getColorValuesForPalette(
        paletteIndex: PaletteIndex,
        palettes: ColorPalette[],
        mask = 0b111,
    ): [ DisplayModeColor, DisplayModeColor, DisplayModeColor ] {
        const effectiveIndex: PaletteIndex = (paletteIndex & mask) as any;
        const effectivePalette: ColorPalette = palettes[effectiveIndex]!;

        const colorIndexes: [ ColorIndex, ColorIndex, ColorIndex ] = [ 0, 1, 2 ];
        return colorIndexes
            .map((colorIndex) => {
                const key0: DisplayModeColorString = `P${effectiveIndex}C${colorIndex}`;
                const c1: DisplayModeColor = {
                    label: key0,
                    value: {
                        palette: effectivePalette,
                        index: colorIndex,
                    },
                };
                return c1;
            }) as [ DisplayModeColor, DisplayModeColor, DisplayModeColor ];
    }

    public getColors(
        paletteSet: ColorPaletteSet,
        palette: ColorPalette,
    ): DisplayModeColorValue[] {
        const paletteIndex = paletteSet.getPalettes().indexOf(palette);
        if (!isPaletteIndex(paletteIndex)) {
            throw new Error(`ColorPalette{${palette.id}} not found in ColorPaletteSet{${paletteSet.id}}`);
        }

        const palettes = paletteSet.getPalettes();
        if (!palettes[0] || !palettes[1] || !palettes[2] || !palettes[3] ||
            !palettes[4] || !palettes[5] || !palettes[6] || !palettes[7] || !palettes[paletteIndex]
        ) {
            throw new Error(`PaletteSet must have at least eight palettes`);
        }

        const t: DisplayModeColor = {
            label: 'T',
            value: 'transparent',
        };

        const bg: DisplayModeColor = {
            label: 'BG',
            value: 'background',
        };

        const [ c1, c2, c3 ] = this.getColorValuesForPalette(paletteIndex, palettes);

        const mapPalette = (palette: ColorPalette, paletteIndex: PaletteIndex): DisplayModeColorValue[] => {
            return palette.colors.map((_, index): DisplayModeColorValue => {
                const colorIndex = index as ColorIndex;
                return [ {
                    label: `P${paletteIndex}C${colorIndex}`,
                    value: {
                        palette,
                        index: index as ColorIndex,
                    },
                } ];
            });
        };

        switch (this.name) {
            case 'none':
                return [ [ bg ] ].concat(
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
                    [ t ],
                    [ c1 ],
                    [ c2 ],
                    [ c3 ],
                ];
            case '160B': {
                const mask = 0b100;
                const startIndex: 0 | 4 = (paletteIndex & mask) as any;
                return [ [ t ] ].concat(
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
                    [ t, t ],
                    [ bg, c2 ],
                    [ c2, bg ],
                    [ c2, c2 ],
                ];
            case '320B': {
                const [ c1, c2, c3 ] = this.getColorValuesForPalette(paletteIndex, palettes, 0b100);

                return [
                    [ t, t ],
                    [ bg, c2 ],
                    [ bg, c3 ],
                    [ c1, c2 ],
                    [ c1, c3 ],
                    [ c2, bg ],
                    [ c2, c1 ],
                    [ c2, c2 ],
                    [ c2, c3 ],
                    [ c3, bg ],
                    [ c3, c1 ],
                    [ c3, c2 ],
                    [ c3, c3 ],
                ];
            }
            case '320C': {
                const mask = 0b100;
                const startIndex: 0 | 4 = (paletteIndex & mask) as any;

                return [ [ t, t ] ].concat(
                    palettes
                        .slice(startIndex, startIndex + mask)
                        .map((palette, i) => {
                            const paletteIndex = startIndex + i;
                            if (!isPaletteIndex(paletteIndex)) {
                                throw new Error();
                            }

                            const c1: DisplayModeColor = {
                                label: `P${paletteIndex}C1`,
                                value: {
                                    index: 1,
                                    palette,
                                },
                            };

                            return [
                                [ c1, c1 ],
                                [ c1, bg ],
                                [ bg, c1 ],
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
                            [ t, t ],
                            [ bg, c2 ],
                            [ c2, bg ],
                            [ c2, c2 ],
                        ];
                    case 1:
                    case 5:
                        return [
                            [ t, t ],
                            [ bg, c3 ],
                            [ c2, c1 ],
                            [ c2, c3 ],
                        ];
                    case 2:
                    case 6:
                        return [
                            [ t, t ],
                            [ c1, c2 ],
                            [ c3, bg ],
                            [ c3, c2 ],
                        ];
                    case 3:
                    case 7:
                        return [
                            [ t, t ],
                            [ c1, c3 ],
                            [ c3, c1 ],
                            [ c3, c3 ],
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

    public convertPixelsToBytes(pixels: PixelInfo[], paletteIndex: PaletteIndex): number[] {
        const bytes: number[] = [];
        const pixelsPerByte = this.pixelsPerByte;
        if (pixels.length % pixelsPerByte !== 0) {
            throw new Error(`width is not a multiple of ${pixelsPerByte} (${pixels.length})`);
        }

        for (let i = 0; i < pixels.length; i += pixelsPerByte) {
            const chunk = pixels.slice(i, i + pixelsPerByte);

            switch (this.name) {
                case '160A':
                case '320A': {
                    const byte = chunk
                        .map((pixel, i) => {
                            const index = (pixel.modeColorIndex || 0) % 4;
                            return index << (6 - (i * 2));
                        })
                        .reduce((result, value) => result | value, 0);
                    bytes.push(byte);
                    break;
                }
                case '160B': {
                    const byte = chunk
                        .map((pixel, i) => {
                            let index = pixel.modeColorIndex || 0;
                            if (index === 0) {
                                return 0;
                            }

                            // we don't present the other three transparent options (what would be indices 1,2,3)
                            index += 3;

                            // 0,1,2,3  -> 0, 0,1,2,3
                            // 4,5,6    -> 0, 1,2,3
                            // 7,8,9    -> 1, 1,2,3
                            // 10,11,12 -> 2, 1,2,3
                            // 13,14,15 -> 3, 1,2,3

                            const color = (((index - 1) % 3) + 1) << 4; // 10 -> (9 % 3) + 1 -> 1
                            const palette = Math.floor((index - 4) / 3); // 10 -> (6 / 3) -> 2
                            return (color | palette) << (2 - (i * 2));
                        })
                        .reduce((result, value) => result | value, 0);
                    bytes.push(byte);
                    break;
                }
                default:
                    throw new Error(`display mode "${this.name}" is not supported yet`);
            }
        }

        return bytes;
    }
}

export default DisplayMode;
