import { type ColorIndex, ColorPalette } from './ColorPalette.ts';
import { ColorPaletteSet } from './ColorPaletteSet.ts';
import type { Atari7800Color } from './colors.ts';
import { EventEmitter } from './EventEmitter.ts';
import { Logger } from './Logger.ts';

export interface ColorPaletteSetCollectionOptions {
    mountEl: HTMLElement;
    paletteSets: ColorPaletteSet[];
}

export type ColorPaletteSetCollectionEventMap = {
    color_select: [ ColorPaletteSet, ColorPalette, Atari7800Color, ColorIndex ];
    color_change: [ ColorPaletteSet, ColorPalette, Atari7800Color, ColorIndex ];
    bg_select: [ ColorPaletteSet, Atari7800Color ];
}

export class ColorPaletteSetCollection extends EventEmitter<ColorPaletteSetCollectionEventMap> {
    private readonly $el: HTMLElement;
    private readonly paletteSets: ColorPaletteSet[] = [];
    private initialized = false;
    private activePaletteSet: ColorPaletteSet | null = null;
    private readonly logger: Logger;

    public constructor(options: ColorPaletteSetCollectionOptions) {
        super();
        this.logger = Logger.from(this);
        this.$el = options.mountEl;
        this.paletteSets = options.paletteSets;

        if (!this.paletteSets.length) {
            throw new Error(`ColorPaletteSetCollection requires at least one ColorPaletteSet`);
        }

        this.activatePaletteSet(this.paletteSets[0]);
    }

    public init(): void {
        if (this.initialized) {
            return;
        }

        this.logger.debug('initializing');

        this.paletteSets.forEach((paletteSet) => {
            paletteSet.init();
            paletteSet.on('color_select', (palette, color, index) => {
                this.emit('color_select', paletteSet, palette, color, index);
            });
            paletteSet.on('color_change', (palette, color, index) => {
                this.emit('color_change', paletteSet, palette, color, index);
            });
            paletteSet.on('bg_select', (color) => {
                this.emit('bg_select', paletteSet, color);
            });
        });

        this.initialized = true;
    }

    public activatePaletteSet(paletteSet?: ColorPaletteSet | null): void {
        if (paletteSet) {
            if (this.paletteSets.indexOf(paletteSet) === -1) {
                this.logger.warn(`activated palette set not found in array`);
                return;
            }
        }

        this.logger.debug(`activating palette set ${paletteSet?.id || '[null]'}`);
        this.activePaletteSet = paletteSet || null;
        this.paletteSets.forEach((p) => {
            if (p === paletteSet) {
                p.activate();
            } else {
                p.deactivate();
            }
        });
    }
}
