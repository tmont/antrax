import { ColorPicker } from './ColorPicker.ts';
import {
    type ColorPaletteType,
    colors,
    type ColorSerialized,
    colorToJson,
    convertToClosestColor,
    convertToIndexed,
    getA7800ColorObject,
    getRGBIndex,
    type IndexedRGBColor,
    nesColors,
    pico8Colors,
    type RGBColor,
    rgbToHex,
    type RGBValues
} from './colors.ts';
import { EventEmitter } from './EventEmitter.ts';
import { Logger } from './Logger.ts';
import { findElement, parseTemplate } from './utils-dom.ts';
import { generateId, isPaletteColorIndex, nope, type PaletteColorIndex } from './utils.ts';

type AllowedColorOption = IndexedRGBColor | ColorSerialized;

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
    color_select: [ IndexedRGBColor, PaletteColorIndex ];
    color_change: [ IndexedRGBColor, PaletteColorIndex ];
};

export class ColorPalette extends EventEmitter<ColorPaletteEventMap> {
    public readonly colors: [ IndexedRGBColor, IndexedRGBColor, IndexedRGBColor ];
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

        const color1 = getA7800ColorObject(options?.colors?.[0]) || convertToIndexed(colors[0x47]);

        this.colors = [
            color1,
            getA7800ColorObject(options?.colors?.[1]) || convertToIndexed(colors[0xe6]),
            getA7800ColorObject(options?.colors?.[2]) || convertToIndexed(colors[0x97]),
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

                const picker = ColorPicker.create(this.type, {
                    activeColor: this.colors[paletteColorIndex],
                    title: `Change ${this.name}C${paletteColorIndex}`,
                });

                picker.on('color_select', (color) => {
                    this.logger.debug(`ColorPalette{${this.id}} selected color ${color.index} (${color.hex})`);
                    this.colors[paletteColorIndex] = color;
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
            this.logger.debug(`replaced "${rgbToHex(color)}" with "${newColor.hex}"`);
        });

        this.updateColors();
    }

    public static convertColors(
        type: ColorPaletteType,
        colorsToConvert: Readonly<RGBValues>[],
        callback: (original: RGBValues, converted: IndexedRGBColor, index: number) => void,
    ): void {
        let conversionColors: Readonly<IndexedRGBColor[]> = [];

        switch (type) {
            case 'atari7800':
                conversionColors = colors;
                break;
            case 'rgb':
                conversionColors = colorsToConvert.map((color) => {
                    return {
                        ...color,
                        hex: rgbToHex(color),
                        index: getRGBIndex(color),
                    };
                });
                return;
            case 'pico8':
                conversionColors = pico8Colors;
                break;
            case 'nes':
                conversionColors = nesColors;
                break;
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
