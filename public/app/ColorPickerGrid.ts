import { ColorPickerBase } from './ColorPickerBase.ts';
import { type IndexedRGBColor, type ColorPaletteType, type ColorPaletteTypeFinite } from './colors.ts';
import { findOrDie, parseTemplate } from './utils-dom.ts';
import { zeroPad } from './utils.ts';

const tmpl = `<div class="color-picker"><form></form></div>`;

interface ColorPickerGridOptions {
    type: ColorPaletteTypeFinite;
    rows: number;
    cols: number;
    readonly colors: Readonly<IndexedRGBColor[]>;
}

export class ColorPickerGrid extends ColorPickerBase {
    private readonly paletteType: ColorPaletteTypeFinite;

    public constructor(options: ColorPickerGridOptions) {
        super({
            $content: parseTemplate(tmpl),
        });

        if (options.rows * options.cols !== options.colors.length) {
            throw new Error(`rows * cols must equal number of colors ` +
                `(${options.rows * options.cols} != ${options.colors.length}`);
        }

        this.paletteType = options.type;

        const $form = findOrDie(this.$el, 'form', node => node instanceof HTMLFormElement);

        // column headers
        for (let i = 0; i < options.cols + 1; i++) {
            const $span = document.createElement('span');
            $span.innerText = i === 0 ? '' : ((i - 1) % 16).toString(16).toUpperCase();
            $form.appendChild($span);
        }

        options.colors.forEach((color, i) => {
            if (i % options.cols === 0) {
                // row header, except for first column
                const row = Math.floor(i / 16).toString(16).toUpperCase();
                const $span = document.createElement('span');
                $span.innerText = row;
                $form.appendChild($span);
            }

            const swatch = document.createElement('button');
            swatch.type = 'submit';
            swatch.classList.add('color-swatch', 'selectable');
            swatch.setAttribute('data-color-index', color.index.toString());
            swatch.style.backgroundColor = color.hex;
            swatch.setAttribute('title',
                `$${zeroPad(color.index.toString(16).toUpperCase(), 2)} (${color.hex})`);
            $form.appendChild(swatch);
        });

        $form.addEventListener('submit', (e) => {
            e.preventDefault();

            const btn = e.submitter;
            if (!(btn instanceof HTMLButtonElement)) {
                return;
            }

            const index = Number(btn.getAttribute('data-color-index'));
            const color = options.colors.find(color => color.index === index);
            if (!color) {
                this.logger.error(`invalid color index submitted: ${index}`);
                return;
            }

            $form.querySelectorAll('.active').forEach((el) => {
                el.classList.remove('active');
            });
            btn.classList.add('active');

            this.logger.debug(`selected color ${index} (${color.hex})`);
            this.emit('color_select', color);
        });
    }

    public get name(): string {
        return 'ColorPickerGrid';
    }

    public get type(): ColorPaletteType {
        return this.paletteType;
    }

    public hide(): void {
        this.popover.hide();
    }

    public setActiveColor(color: IndexedRGBColor | null): void {
        super.setActiveColor(color);
        this.$el.querySelectorAll('.color-swatch').forEach((el) => {
            const index = el.getAttribute('data-color-index');
            el.classList.toggle('active', index === color?.index.toString());
        });
    }
}
