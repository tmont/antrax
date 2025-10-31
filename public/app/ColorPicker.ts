import { type Atari7800Color, colors } from './colors.ts';
import { EventEmitter } from './EventEmitter.ts';
import { Logger } from './Logger.ts';
import { Popover, type PopoverEventMap } from './Popover.ts';
import { findOrDie, parseTemplate } from './utils.ts';

const tmpl = `<div class="color-picker"><form></form></div>`;

export interface ColorPickerOptions {
    title?: string;
    activeColor?: Atari7800Color | null;
}

export type ColorPickerEventMap = {
    color_select: [ Atari7800Color, number ];
    hide: PopoverEventMap['hide'];
};

export class ColorPicker extends EventEmitter<ColorPickerEventMap>{
    private readonly logger: Logger;
    private readonly popover: Popover;
    private readonly title: string;
    private activeColor: Readonly<Atari7800Color> | null;

    public constructor(options?: ColorPickerOptions) {
        super();

        this.title = options?.title || 'Choose a color';
        this.activeColor = options?.activeColor || null;
        this.logger = Logger.from(this);

        const $el = parseTemplate(tmpl);
        const $form = findOrDie($el, 'form', node => node instanceof HTMLFormElement);

        colors.forEach((color) => {
            const swatch = document.createElement('button');
            swatch.type = 'submit';
            swatch.classList.add('color-swatch');
            if (color === this.activeColor) {
                swatch.classList.add('active');
            }
            swatch.setAttribute('data-color-index', color.index.toString());
            swatch.style.backgroundColor = color.hex;
            swatch.setAttribute('title', `[${color.index}] ${color.hex}`);
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

            this.activeColor = color;
            this.logger.debug(`selected color ${index} (${color.hex})`);
            this.emit('color_select', color, index);
        });

        this.popover = new Popover({
            content: $el,
            title: this.title,
        });

        this.popover.bubble('hide', this);
    }

    public hide(): void {
        this.popover.hide();
    }

    public show($target: HTMLElement): void {
        this.popover.show($target);
    }
}
