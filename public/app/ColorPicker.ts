import { type Atari7800Color, colors } from './colors.ts';
import { EventEmitter } from './EventEmitter.ts';
import { Logger } from './Logger.ts';
import { Popover, type PopoverEventMap } from './Popover.ts';
import { findOrDie, parseTemplate, zeroPad } from './utils.ts';

const tmpl = `<div class="color-picker"><form></form></div>`;

export interface ColorPickerOptions {
    title?: string | null;
    activeColor?: Atari7800Color | null;
}

export type ColorPickerEventMap = {
    color_select: [ Atari7800Color, number ];
    hide: PopoverEventMap['hide'];
};

export class ColorPicker extends EventEmitter<ColorPickerEventMap>{
    private readonly logger: Logger;
    private readonly popover: Popover;

    private readonly $el: HTMLElement;

    private static instance: ColorPicker = new ColorPicker();

    public get name(): string {
        return 'ColorPicker';
    }

    public constructor() {
        super();

        this.logger = Logger.from(this);

        const $el = this.$el = parseTemplate(tmpl);
        const $form = findOrDie($el, 'form', node => node instanceof HTMLFormElement);

        // note: this all assumes there are 256 colors (e.g. 16*16)

        // column headers
        for (let i = 0; i < 17; i++) {
            const $span = document.createElement('span');
            $span.innerText = i === 0 ? '' : ((i - 1) % 16).toString(16).toUpperCase();
            $form.appendChild($span);
        }

        colors.forEach((color, i) => {
            if (i % 16 === 0) {
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
            const color = colors[index];
            if (!color) {
                this.logger.error(`invalid color index submitted: ${index}`);
                return;
            }

            $form.querySelectorAll('.active').forEach((el) => {
                el.classList.remove('active');
            });
            btn.classList.add('active');

            this.logger.debug(`selected color ${index} (${color.hex})`);
            this.emit('color_select', color, index);
        });

        this.popover = new Popover({
            content: $el,
        });

        this.popover.on('hide', () => this.emit('hide'));
    }

    public hide(): void {
        this.popover.hide();
    }

    public show($target: HTMLElement): void {
        this.popover.show($target);
    }

    public setActiveColor(color: Atari7800Color | null): void {
        this.$el.querySelectorAll('.color-swatch').forEach((el) => {
            const index = el.getAttribute('data-color-index');
            el.classList.toggle('active', index === color?.index.toString());
        });
    }

    public setTitle(title: string | null): void {
        this.popover.setTitle(title);
    }

    public static singleton(options?: ColorPickerOptions): ColorPicker {
        const instance = ColorPicker.instance;
        instance.off();

        instance.setTitle(options?.title || null);
        instance.setActiveColor(options?.activeColor || null);

        return instance;
    }
}
