import type { ColorPaletteType, IndexedRGBColor, RGBColor } from './colors.ts';
import { EventEmitter } from './EventEmitter.ts';
import { Logger } from './Logger.ts';
import { Popover, type PopoverEventMap } from './Popover.ts';

export type ColorPickerEventMap = {
    color_select: [ IndexedRGBColor ];
    show: PopoverEventMap['show'];
    hide: PopoverEventMap['hide'];
};

export interface ColorPickerBaseOptions {
    title?: string | null;
    activeColor?: IndexedRGBColor | null;
}

export abstract class ColorPickerBase extends EventEmitter<ColorPickerEventMap>{
    protected activeColor: IndexedRGBColor | null = null;
    protected readonly popover: Popover;
    protected readonly $el: HTMLElement;
    protected readonly logger: Logger;

    protected constructor(options: { $content: HTMLElement }) {
        super();

        this.$el = options.$content;
        this.logger = Logger.from(this);

        this.popover = new Popover({
            content: this.$el,
        });

        this.popover.on('show', () => this.emit('show'));
        this.popover.on('hide', () => this.emit('hide'));
    }

    public get name(): string {
        return 'ColorPickerBase';
    }

    public abstract get type(): ColorPaletteType;

    public setTitle(title?: string | null): void {
        this.popover.setTitle(title || null);
    }

    public setActiveColor(color?: IndexedRGBColor | null): void {
        this.activeColor = color || null;
    }

    public show($target: HTMLElement): void {
        this.popover.show($target);
    }
}
