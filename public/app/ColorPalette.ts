import { ColorPicker } from './ColorPicker.ts';
import { type Atari7800Color, colors, type ColorSerialized, colorToJson, getColorObject } from './colors.ts';
import { EventEmitter } from './EventEmitter.ts';
import { Logger } from './Logger.ts';
import { findElement, parseTemplate } from './utils.ts';

export interface ColorPaletteOptions {
    id?: ColorPalette['id'];
    name: string;
    colors?: [ Atari7800Color | ColorSerialized, Atari7800Color | ColorSerialized, Atari7800Color | ColorSerialized ];
}

export interface ColorPaletteSerialized {
    id: ColorPalette['id'];
    name: ColorPalette['name'];
    colors: [ ColorSerialized, ColorSerialized, ColorSerialized ];
}

const tmpl = `
<div class="color-palette-container">
    <header class="color-palette-name"></header>
    <div class="color-swatch-list">
        <div class="color-swatch selectable" data-index="0"></div>
        <div class="color-swatch selectable" data-index="1"></div>
        <div class="color-swatch selectable" data-index="2"></div>
    </div>
</div>
`;

export type ColorIndex = 0 | 1 | 2;

export type ColorPaletteEventMap = {
    color_select: [ Atari7800Color, ColorIndex ],
    color_change: [ Atari7800Color, ColorIndex ],
};

export class ColorPalette extends EventEmitter<ColorPaletteEventMap> {
    public colors: [ Atari7800Color, Atari7800Color, Atari7800Color ]; // TODO
    public name: string; // TODO
    private initialized = false;
    private readonly logger: Logger;
    private $el: HTMLElement | null = null;
    public readonly id: number;
    private static instanceCount = 0;

    public constructor(options: ColorPaletteOptions) {
        super();

        ColorPalette.instanceCount++;

        this.id = options.id || ColorPalette.instanceCount;
        this.name = options.name;
        this.colors = [
            getColorObject(options?.colors?.[0], colors[0x47]),
            getColorObject(options?.colors?.[1], colors[0xe6]),
            getColorObject(options?.colors?.[2], colors[0x97]),
        ];
        this.logger = Logger.from(this);
    }

    public init($container: HTMLElement): void {
        if (this.initialized) {
            return;
        }

        this.$el = parseTemplate(tmpl);

        this.updateName();
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
            const $swatch = findElement($el, `[data-index="${paletteColorIndex}"]`);
            const picker = new ColorPicker({
                activeColor: this.colors[paletteColorIndex],
                title: `Change ${this.name} C${paletteColorIndex}`,
            });

            picker.on('color_select', (color) => {
                this.colors[paletteColorIndex] = color;
                this.updateColors();
                this.emit('color_change', color, paletteColorIndex as ColorIndex);
            });

            $swatch.addEventListener('click', (e) => {
                if (!(e.target instanceof HTMLElement)) {
                    return;
                }

                picker.show(e.target);
            });
        });

        $container.appendChild(this.$el);

        this.initialized = true;
    }

    public updateName(): void {
        if (!this.$el) {
            throw new Error(`ColorPalette has not been initialized, cannot update name`);
        }

        findElement(this.$el, '.color-palette-name').innerText = this.name;
    }

    public updateColors(): void {
        const $el = this.$el;
        if (!$el) {
            throw new Error(`ColorPalette has not been initialized, cannot update colors`);
        }

        this.colors.forEach((color, i) => {
            findElement($el, `[data-index="${i}"]`).style.backgroundColor = color.hex;
        });
    }

    public getColorAt(index: ColorIndex): Readonly<Atari7800Color> {
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
