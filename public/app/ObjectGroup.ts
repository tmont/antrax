import { type ColorIndex, ColorPalette } from './ColorPalette.ts';
import type { ColorPaletteSet } from './ColorPaletteSet.ts';
import type { Atari7800Color } from './colors.ts';
import { Logger } from './Logger.ts';

export interface ObjectGroupOptions {
    name?: string;
    paletteSet: ColorPaletteSet;
    palette: ColorPalette;
    colorIndex?: ColorIndex;
    backgroundColor: Atari7800Color;
}

export class ObjectGroup {
    public readonly id: string;
    public name: string;

    private readonly logger: Logger;

    private paletteSet: Readonly<ColorPaletteSet>;
    private activePalette: Readonly<ColorPalette>;
    private activeColorIndex: ColorIndex;

    private static instanceCount = 0;

    public constructor(options: ObjectGroupOptions) {
        ObjectGroup.instanceCount++;
        this.id = ObjectGroup.instanceCount.toString();
        this.name = options.name || `Group ${this.id}`;
        this.paletteSet = options.paletteSet;
        this.activePalette = options.palette;
        this.activeColorIndex = options.colorIndex || 0;

        this.logger = Logger.from(this);
    }

    public getPaletteSet(): Readonly<ColorPaletteSet> {
        return this.paletteSet;
    }

    public getActivePalette(): Readonly<ColorPalette> {
        return this.activePalette;
    }

    public getActiveColorIndex(): ColorIndex {
        return this.activeColorIndex;
    }

    public getBackgroundColor(): Readonly<Atari7800Color> {
        return this.paletteSet.getBackgroundColor();
    }

    public getActiveColor(): Atari7800Color {
        return this.activePalette.getColorAt(this.activeColorIndex);
    }

    public setActiveColor(paletteSet: ColorPaletteSet, palette: ColorPalette, index: ColorIndex): void {
        this.paletteSet = paletteSet;
        this.activePalette = palette;
        this.activeColorIndex = index;

        this.logger.info(`setting active color to ${palette.name}[${index}]`, this.getActiveColor());
    }
}
