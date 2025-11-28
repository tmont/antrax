import { ColorPalette, type ColorPaletteSerialized } from './ColorPalette.ts';
import { ColorPicker } from './ColorPicker.ts';
import { type Atari7800Color, colors, type ColorSerialized, colorToJson } from './colors.ts';
import { type SerializationContext, SerializationTypeError } from './errors.ts';
import { EventEmitter } from './EventEmitter.ts';
import { Logger } from './Logger.ts';
import {
    CodeGenerationDetailLevel,
    type CodeGenerationOptions,
    type ColorIndex,
    type DisplayModeColorValue,
    findElement,
    formatAssemblyNumber,
    generateId,
    parseTemplate
} from './utils.ts';

export interface ColorPaletteSetOptions {
    id?: ColorPaletteSet['id'];
    mountEl: HTMLElement;
    backgroundColor?: Atari7800Color | ColorSerialized;
    palettes?: ColorPalette[] | ColorPaletteSerialized[];
    name?: string;
}

export interface ColorPaletteSetSerialized {
    id: string | number;
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
    private readonly $bgSwatch: HTMLElement;
    private readonly logger: Logger;
    private initialized = false;
    private name: string;
    public readonly id: string;

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

                return new ColorPalette({
                    colors: palette.colors,
                    id: String(palette.id),
                    name: palette.name,
                });
            }) :
            [];

        while (palettes.length < 8) {
            palettes.push(new ColorPalette({
                name: 'P' + palettes.length,
            }));
        }

        this.id = options.id || generateId();
        this.backgroundColor = bg || colors[3];
        this.palettes = palettes;
        this.name = options.name || `Palette Set ${ColorPaletteSet.instanceCount}`;
        this.logger = Logger.from(this);

        this.$container = options.mountEl;
        this.$el = parseTemplate(paletteSetTmpl);
        this.$bgSwatch = findElement(this.$el, '.bg-color-container .color-swatch');
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

    public containsPalette(palette: ColorPalette): boolean {
        return this.palettes.indexOf(palette) !== -1;
    }

    public setActivePalette(palette?: ColorPalette | null): void {
        // this.logger.debug(`setting active palette to ${palette?.id || 'null'}`);
        this.palettes.forEach(p => p.setActiveState(p === palette));
    }

    /**
     * This is separate from setActivePalette because not all display modes require
     * a color palette, and some colors span multiple palettes
     */
    public setActiveColor(color?: DisplayModeColorValue | null): void {
        const paletteColorMap: Record<ColorPalette['id'], ColorIndex[]> = {};
        let activateBg = false;

        color?.colors.forEach((color) => {
            if (color.value === 'background') {
                activateBg = true;
                return;
            }

            if (color.value === 'transparent') {
                return;
            }

            const map = paletteColorMap[color.value.palette.id] = paletteColorMap[color.value.palette.id] || [];
            map.push(color.value.index);
        });

        this.palettes.forEach((palette) => {
            const colors = paletteColorMap[palette.id] || [];
            palette.setActiveColors(colors);
        });

        this.$bgSwatch.classList.toggle('active', activateBg);
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

        this.$bgSwatch.addEventListener('click', (e) => {
            if (!(e.target instanceof HTMLElement)) {
                return;
            }

            const picker = ColorPicker.singleton({
                activeColor: this.backgroundColor,
                title: 'Change background color',
            });
            picker.on('color_select', (color) => {
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

        this.logger.debug(`ColorPaletteSet{${this.id}} set background color to ${color.index} (${color.hex})`);
    }

    public generateCode(options: CodeGenerationOptions): string {
        const indent = options.indentChar;

        const code = [
            '/*',
            `Palette${options.labelColon ? ':' : ''}`,
        ];

        const generateCodeLine = (color: Atari7800Color, label: string): string => {
            let line = `${indent}.byte ${formatAssemblyNumber(color.index, 16)}`;
            if (options.commentLevel >= CodeGenerationDetailLevel.Some) {
                line += ` ; ${label}`;
                if (options.commentLevel >= CodeGenerationDetailLevel.Lots) {
                    line += ' '.repeat(Math.max(0, 4 - label.length)) + ` - ${color.hex}`;
                }
            }

            return line;
        };

        code.push(generateCodeLine(this.backgroundColor, 'BG'));

        this.palettes.forEach((palette) => {
            palette.colors.forEach((color, colorIndex) => {
                code.push(generateCodeLine(color, palette.name + 'C' + colorIndex));
            });
        });

        code.push('*/');

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
        this.ensureSerialized(json);

        return new ColorPaletteSet({
            id: String(json.id),
            mountEl,
            palettes: json.palettes,
            backgroundColor: json.backgroundColor,
            name: json.name,
        });
    }

    public static ensureSerialized(json: any): asserts json is ColorPaletteSetSerialized {
        const context: SerializationContext = 'ColorPaletteSet';

        if (!json.id || (typeof json.id !== 'string' && typeof json.id !== 'number')) {
            throw new SerializationTypeError(context, 'id', 'non-empty string or number', json.id);
        }
        if (typeof json.name !== 'string') {
            throw new SerializationTypeError(context, 'name', 'string', json.name);
        }
        if (typeof json.backgroundColor !== 'number') {
            throw new SerializationTypeError(context, 'backgroundColor', 'number', json.backgroundColor);
        }
        if (!Array.isArray(json.palettes) && !json.palettes.every((item: unknown) => typeof item === 'object')) {
            throw new SerializationTypeError(context, 'palettes', 'array of objects');
        }
    }
}
