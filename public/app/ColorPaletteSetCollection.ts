import { type ColorIndex, ColorPalette } from './ColorPalette.ts';
import { ColorPaletteSet, type ColorPaletteSetSerialized } from './ColorPaletteSet.ts';
import type { Atari7800Color } from './colors.ts';
import type { EditorSettings } from './Editor.ts';
import { EventEmitter } from './EventEmitter.ts';
import { Logger } from './Logger.ts';

export interface ColorPaletteSetCollectionOptions {
    paletteSets: ColorPaletteSet[];
    editorSettings: EditorSettings;
}

export interface ColorPaletteSetCollectionSerialized {
    paletteSets: ColorPaletteSetSerialized[];
}

export type ColorPaletteSetCollectionEventMap = {
    color_change: [ ColorPaletteSet, ColorPalette, Atari7800Color, ColorIndex ];
    bg_select: [ ColorPaletteSet, Atari7800Color ];
}

export class ColorPaletteSetCollection extends EventEmitter<ColorPaletteSetCollectionEventMap> {
    private readonly paletteSets: ColorPaletteSet[] = [];
    private initialized = false;
    private readonly editorSettings: Readonly<EditorSettings>;
    private readonly logger: Logger;

    public constructor(options: ColorPaletteSetCollectionOptions) {
        super();
        this.logger = Logger.from(this);
        this.paletteSets = options.paletteSets;

        if (!this.paletteSets.length) {
            throw new Error(`ColorPaletteSetCollection requires at least one ColorPaletteSet`);
        }

        this.editorSettings = options.editorSettings;
        this.activatePaletteSet();
    }

    public get name(): string {
        return 'ColorPaletteSetCollection';
    }

    public getPaletteSets(): Readonly<ColorPaletteSet[]> {
        return this.paletteSets;
    }

    public init(): void {
        if (this.initialized) {
            return;
        }

        this.logger.debug('initializing');

        this.paletteSets.forEach((paletteSet) => {
            paletteSet.init();
            paletteSet.on('color_change', (palette, color, index) => {
                this.emit('color_change', paletteSet, palette, color, index);
            });
            paletteSet.on('bg_select', (color) => {
                this.emit('bg_select', paletteSet, color);
            });
        });

        this.initialized = true;
    }

    public destroy(): void {
        this.paletteSets.forEach(paletteSet => paletteSet.destroy());
    }

    public activatePaletteSet(): void {
        if (this.paletteSets.indexOf(this.editorSettings.activeColorPaletteSet) === -1) {
            this.logger.warn(`activated palette set not found in array`);
            return;
        }

        this.logger.debug(`activating palette set ${this.editorSettings.activeColorPaletteSet.id}`);
        this.paletteSets.forEach((paletteSet) => {
            if (paletteSet === this.editorSettings.activeColorPaletteSet) {
                paletteSet.activate();
            } else {
                paletteSet.deactivate();
            }
        });
    }

    public toJSON(): ColorPaletteSetCollectionSerialized {
        return {
            paletteSets: this.paletteSets.map(set => set.toJSON()),
        };
    }

    public static fromJSON(
        json: object,
        editorSettings: EditorSettings,
        paletteSets: ColorPaletteSet[],
    ): ColorPaletteSetCollection {
        if (!isSerialized(json)) {
            throw new Error(`Cannot deserialize ColorPaletteSetCollection`);
        }

        return new ColorPaletteSetCollection({
            editorSettings,
            paletteSets,
        });
    }
}

const isSerialized = (json: object): json is ColorPaletteSetCollectionSerialized => {
    if (!Array.isArray((json as ColorPaletteSetCollectionSerialized).paletteSets)) {
        return false;
    }

    if (!((json as ColorPaletteSetCollectionSerialized).paletteSets).every(json => typeof json === 'object')) {
        return false;
    }

    return true;
};
