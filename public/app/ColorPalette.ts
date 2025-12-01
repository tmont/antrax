import { ColorPicker } from './ColorPicker.ts';
import { type Atari7800Color, colors, type ColorSerialized, colorToJson, getColorObject } from './colors.ts';
import { EventEmitter } from './EventEmitter.ts';
import { Logger } from './Logger.ts';
import { type ColorIndex, findElement, generateId, isPaletteColorIndex, parseTemplate } from './utils.ts';

export interface ColorPaletteOptions {
    id?: ColorPalette['id'];
    name: string;
    colors?: [ Atari7800Color | ColorSerialized, Atari7800Color | ColorSerialized, Atari7800Color | ColorSerialized ];
}

export interface ColorPaletteSerialized {
    id: string | number;
    name: ColorPalette['name'];
    colors: [ ColorSerialized, ColorSerialized, ColorSerialized ];
}

const colorIndices: Record<ColorIndex, 1> = {
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
    color_select: [ Atari7800Color, ColorIndex ],
    color_change: [ Atari7800Color, ColorIndex ],
};

export class ColorPalette extends EventEmitter<ColorPaletteEventMap> {
    public readonly colors: [ Atari7800Color, Atari7800Color, Atari7800Color ];
    public readonly name: string;
    private initialized = false;
    private readonly logger: Logger;
    private readonly $el: HTMLElement;
    public readonly id: string;

    public constructor(options: ColorPaletteOptions) {
        super();

        this.id = options.id || generateId();
        this.name = options.name;
        this.colors = [
            getColorObject(options?.colors?.[0], colors[0x47]),
            getColorObject(options?.colors?.[1], colors[0xe6]),
            getColorObject(options?.colors?.[2], colors[0x97]),
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

                const picker = ColorPicker.singleton({
                    activeColor: this.colors[paletteColorIndex],
                    title: `Change ${this.name}C${paletteColorIndex}`,
                });

                picker.on('color_select', (color) => {
                    this.colors[paletteColorIndex] = color;
                    this.logger.debug(`ColorPalette{${this.id}} selected color ${color.index} (${color.hex})`);
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

    public setActiveColors(colors: ColorIndex[]): void {
        const indexMap: Record<ColorIndex, 1> = colors.reduce((map, index) => {
            map[index] = 1;
            return map;
        }, {} as Record<ColorIndex, 1>);

        this.$el.querySelectorAll('[data-index]').forEach(($swatch) => {
            const index = Number($swatch.getAttribute('data-index')) as ColorIndex;
            $swatch.classList.toggle('active', !!indexMap[index]);
        });
    }

    public updateColors(): void {
        this.colors.forEach((color, i) => {
            findElement(this.$el, `[data-index="${i}"]`).style.backgroundColor = color.hex;
        });
    }

    public getColorAt(index: ColorIndex): Atari7800Color {
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
