import {
    type ColorIndex,
    ColorPalette,
    type ColorPaletteSerialized
} from './ColorPalette.ts';
import { ColorPicker } from './ColorPicker.ts';
import { type Atari7800Color, colors, colorToJson, type ColorSerialized } from './colors.ts';
import { EventEmitter } from './EventEmitter.ts';
import type { CodeGenerationOptions } from './PixelCanvas.ts';
import { type AssemblyNumberFormatRadix, findElement, formatAssemblyNumber, parseTemplate } from './utils.ts';

export interface ColorPaletteSetOptions {
    id?: ColorPaletteSet['id'];
    mountEl: HTMLElement;
    backgroundColor?: Atari7800Color | ColorSerialized;
    palettes?: ColorPalette[] | ColorPaletteSerialized[];
    name?: string;
}

export interface ColorPaletteSetSerialized {
    id: ColorPaletteSet['id'];
    name: ColorPaletteSet['name'];
    backgroundColor: ColorSerialized;
    palettes: ColorPaletteSerialized[];
}

const paletteSetTmpl = `
<div class="palette-set-container">
    <div class="palette-set-info">
        <header class="palette-set-name"></header>
    </div>
    <div class="bg-color-container">
        <div class="color-swatch selectable"></div>
    </div>
    <div class="palette-list"></div>
</div>
`;

export type ColorPaletteSetEventMap = {
    bg_select: [ Atari7800Color ];
    color_change: [ ColorPalette, Atari7800Color, ColorIndex ];
};

export class ColorPaletteSet extends EventEmitter<ColorPaletteSetEventMap> {
    private readonly palettes: ColorPalette[] = [];
    private backgroundColor: Readonly<Atari7800Color>;

    private readonly $container: HTMLElement;
    private readonly $el: HTMLElement;
    private initialized = false;
    private name: string;
    public readonly id: number;

    private static instanceCount = 0;

    public constructor(options: ColorPaletteSetOptions) {
        super();
        ColorPaletteSet.instanceCount++;
        const bg = typeof options.backgroundColor === 'number' ? colors[options.backgroundColor] :
            (typeof options.backgroundColor !== 'undefined' ? options.backgroundColor : null);

        const palettes = Array.isArray(options.palettes) ?
            options.palettes.map((palette) => {
                if (palette instanceof ColorPalette) {
                    return palette;
                }

                return new ColorPalette(palette);
            }) :
            [];

        while (palettes.length < 8) {
            palettes.push(new ColorPalette({
                name: 'P' + palettes.length,
            }));
        }

        this.id = options.id || ColorPaletteSet.instanceCount;
        this.backgroundColor = bg || colors[3];
        this.palettes = palettes;
        this.name = options.name || `Palette Set ${this.id}`;

        this.$container = options.mountEl;
        this.$el = parseTemplate(paletteSetTmpl);
    }

    public getPalettes(): ColorPalette[] {
        return this.palettes;
    }

    public getBackgroundColor(): Readonly<Atari7800Color> {
        return this.backgroundColor;
    }

    public getName(): string {
        return this.name;
    }

    public init(): void {
        if (this.initialized) {
            return;
        }

        const $paletteList = findElement(this.$el, '.palette-list');

        this.updateName(this.name);
        this.setBackgroundColor(this.backgroundColor);

        this.palettes.forEach((palette) => {
            palette.init($paletteList);
            palette.on('color_change', (color, index) => {
                this.emit('color_change', palette, color, index);
            });
        });

        findElement(this.$el, '.bg-color-container .color-swatch').addEventListener('click', (e) => {
                if (!(e.target instanceof HTMLElement)) {
                    return;
                }

                const picker = ColorPicker.singleton({
                    activeColor: this.backgroundColor,
                    title: 'Change background color',
                });
                picker.on('color_select', (color, index) => {
                    this.setBackgroundColor(color);
                    this.emit('bg_select', this.backgroundColor);
                });
                picker.show(e.target);
        });

        this.$container.appendChild(this.$el);

        this.initialized = true;
    }

    public destroy(): void {
        this.$el.remove();
        this.palettes.forEach((palette) => palette.off());
    }

    public updateName(newName: string): void {
        const $name = findElement(this.$el, '.palette-set-name');
        this.name = newName || `Palette Set ${this.id}`;
        $name.innerText = this.name;
    }

    public activate(): void {
        this.$el.style.display = '';
    }

    public deactivate(): void {
        this.$el.style.display = 'none';
    }

    public setBackgroundColor(color: Atari7800Color): void {
        this.backgroundColor = color;

        findElement(this.$el, '.bg-color-container .color-swatch').style.backgroundColor =
            this.backgroundColor.hex;
    }

    public generateCode(options: CodeGenerationOptions): string {
        const indent = options.indentChar;

        const code = [
            `Palette${options.labelColon ? ':' : ''}`,
        ];

        const format: AssemblyNumberFormatRadix = 16;
        code.push(`${indent}.byte ${formatAssemblyNumber(this.backgroundColor.index, format)} ; BG`);

        this.palettes.forEach((palette) => {
            palette.colors.forEach((color, colorIndex) => {
                code.push(`${indent}.byte ${formatAssemblyNumber(color.index, format)} ` +
                    `; ${palette.name}C${colorIndex}`);
            });
        });

        return code.join('\n');
    }

    public toJSON(): ColorPaletteSetSerialized {
        return {
            id: this.id,
            name: this.name,
            backgroundColor: colorToJson(this.backgroundColor),
            palettes: this.palettes.map(palette => palette.toJSON()),
        };
    }

    public static fromJSON(json: object, mountEl: HTMLElement): ColorPaletteSet {
        if (!isSerialized(json)) {
            throw new Error(`Cannot deserialize ColorPaletteSet, invalid JSON`);
        }

        return new ColorPaletteSet({
            id: json.id,
            mountEl,
            palettes: json.palettes,
            backgroundColor: json.backgroundColor,
            name: json.name,
        });
    }
}

const isSerialized = (json: any): json is ColorPaletteSetSerialized => {
    if (typeof json.id !== 'number') {
        return false;
    }
    if (typeof json.name !== 'string') {
        return false;
    }
    if (typeof json.backgroundColor !== 'number') {
        return false;
    }
    if (!Array.isArray(json.palettes) && !json.palettes.every((item: unknown) => typeof item === 'object')) {
        return false;
    }

    return true;
};
