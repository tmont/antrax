import { ColorPickerAtari7800 } from './ColorPickerAtari7800.ts';
import { ColorPickerRGB } from './ColorPickerRGB.ts';
import {
    type ColorPaletteType,
    colors,
    type ColorSerialized,
    colorToJson,
    convertToClosestColor,
    convertToRGBColor,
    getA7800ColorObject,
    type IndexedRGBColor,
    isAtari7800Color,
    type RGBColor,
    rgbToHex
} from './colors.ts';
import { EventEmitter } from './EventEmitter.ts';
import { Logger } from './Logger.ts';
import { findElement, parseTemplate } from './utils-dom.ts';
import { generateId, isPaletteColorIndex, nope, type PaletteColorIndex } from './utils.ts';

type AllowedColorOption = RGBColor | ColorSerialized;

export interface ColorPaletteOptions {
    id?: ColorPalette['id'];
    name: string;
    colors?: [ AllowedColorOption, AllowedColorOption, AllowedColorOption ];
    type: ColorPaletteType;
}

export interface ColorPaletteSerialized {
    id: string | number;
    name: ColorPalette['name'];
    colors: [ ColorSerialized, ColorSerialized, ColorSerialized ];
}

const colorIndices: Record<PaletteColorIndex, 1> = {
    0: 1,
    1: 1,
    2: 1,
};
export const colorPaletteTmpl = `
<div class="color-palette-container">
    <header class="color-palette-name"></header>
    <div class="color-swatch-list">
        ${Object.keys(colorIndices).map(index => `<div class="color-swatch selectable" data-index="${index}"></div>`).join('')}
    </div>
</div>
`;

export type ColorPaletteEventMap = {
    color_select: [ RGBColor, PaletteColorIndex ],
    color_change: [ RGBColor, PaletteColorIndex ],
};

const isAtariTuple = (colors: [ RGBColor, RGBColor, RGBColor ]): colors is [ IndexedRGBColor, IndexedRGBColor, IndexedRGBColor ] => {
    return colors.every(color => isAtari7800Color(color));
};

export class ColorPalette extends EventEmitter<ColorPaletteEventMap> {
    public readonly colors: [ RGBColor, RGBColor, RGBColor ];
    public readonly name: string;
    private initialized = false;
    private readonly logger: Logger;
    private readonly $el: HTMLElement;
    public readonly id: string;
    private type: ColorPaletteType = 'rgb';

    public constructor(options: ColorPaletteOptions) {
        super();

        this.id = options.id || generateId();
        this.name = options.name;
        this.type = options.type;

        const color1 = getA7800ColorObject(options?.colors?.[0]) || convertToRGBColor(colors[0x47]);

        this.colors = [
            color1,
            getA7800ColorObject(options?.colors?.[1]) || convertToRGBColor(colors[0xe6]),
            getA7800ColorObject(options?.colors?.[2]) || convertToRGBColor(colors[0x97]),
        ];
        this.$el = parseTemplate(colorPaletteTmpl);
        this.logger = Logger.from(this);
    }

    public init($container: HTMLElement): void {
        if (this.initialized) {
            return;
        }

        findElement(this.$el, '.color-palette-name').innerText = this.name;
        this.updateColors();

        this.$el.querySelectorAll('.color-swatch[data-index]').forEach((swatch) => {
            const index = Number(swatch.getAttribute('data-index'));
            if (index !== 0 && index !== 1 && index !== 2) {
                return;
            }

            const color = this.colors[index];

            swatch.addEventListener('click', () => {
                this.emit('color_select', color, index);
            });
        });

        const $el = this.$el;
        this.colors.forEach((_, paletteColorIndex) => {
            if (!isPaletteColorIndex(paletteColorIndex)) {
                throw new Error(`Cannot handle color index "${paletteColorIndex}"`);
            }

            const $swatch = findElement($el, `[data-index="${paletteColorIndex}"]`);

            $swatch.addEventListener('click', (e) => {
                if (!(e.target instanceof HTMLElement)) {
                    return;
                }

                let picker: ColorPickerAtari7800 | ColorPickerRGB;
                const title = `Change ${this.name}C${paletteColorIndex}`;
                const colors = this.colors;
                if (this.type === 'atari7800' && isAtariTuple(colors)) {
                    picker = ColorPickerAtari7800.singleton({
                        activeColor: colors[paletteColorIndex],
                        title,
                    });
                } else {
                    picker = ColorPickerRGB.singleton({
                        activeColor: colors[paletteColorIndex],
                        title,
                    });
                }

                picker.on('color_select', (color) => {
                    this.colors[paletteColorIndex] = color;

                    const msg = `color` + (isAtari7800Color(color) ? ' ' + color.index : '');

                    this.logger.debug(`ColorPalette{${this.id}} selected ${msg} (${color.hex})`);
                    this.updateColors();
                    this.emit('color_change', color, paletteColorIndex);
                });

                picker.show(e.target);
            });
        });

        $container.appendChild(this.$el);

        this.initialized = true;
    }

    public setActiveState(isActive: boolean): void {
        this.$el?.classList.toggle('active', isActive);
    }

    public setActiveColors(colors: PaletteColorIndex[]): void {
        const indexMap: Record<PaletteColorIndex, 1> = colors.reduce((map, index) => {
            map[index] = 1;
            return map;
        }, {} as Record<PaletteColorIndex, 1>);

        this.$el.querySelectorAll('[data-index]').forEach(($swatch) => {
            const index = Number($swatch.getAttribute('data-index')) as PaletteColorIndex;
            $swatch.classList.toggle('active', !!indexMap[index]);
        });
    }

    public updateColors(): void {
        this.colors.forEach((color, i) => {
            findElement(this.$el, `[data-index="${i}"]`).style.backgroundColor = color.hex;
        });
    }

    public setType(type: ColorPaletteType): void {
        if (type === this.type) {
            return;
        }

        this.logger.info(`changing type from "${this.type}" to "${type}"`);
        this.type = type;

        ColorPalette.convertColors(this.type, this.colors, (color, newColor, i) => {
            this.colors[i] = newColor;
            this.logger.debug(`replaced "${color.hex}" with "${newColor.hex}"`);
        });

        this.updateColors();
    }

    public static convertColors(
        type: ColorPaletteType,
        colorsToConvert: Readonly<RGBColor>[],
        callback: (original: RGBColor, converted: RGBColor, index: number) => void,
    ): void {
        let conversionColors: Readonly<IndexedRGBColor>[] = [];

        switch (type) {
            case 'atari7800':
                conversionColors = colors as any;
                break;
            case 'rgb':
                conversionColors = colorsToConvert.map((color) => {
                    return {
                        ...color,
                        hex: rgbToHex(color), // TODO handle if hex is already present
                        index: (color.r << 16) | (color.g << 8) | color.b,
                    };
                });
                return;
            case 'nes':
            case 'pico8':
                throw new Error(`palette type "${type}" is not supported yet`);
            default:
                nope(type);
                throw new Error(`Unknown palette type "${type}"`);
        }

        for (let i = 0; i < colorsToConvert.length; i++) {
            const color = colorsToConvert[i];
            if (!color) {
                continue;
            }
            const converted = convertToClosestColor(color, conversionColors);
            callback(color, converted, i);
        }
    }

    public getColorAt(index: PaletteColorIndex): RGBColor {
        return this.colors[index];
    }

    public toJSON(): ColorPaletteSerialized {
        return {
            id: this.id,
            name: this.name,
            colors: this.colors.map(colorToJson) as [ ColorSerialized, ColorSerialized, ColorSerialized ],
        };
    }
}
