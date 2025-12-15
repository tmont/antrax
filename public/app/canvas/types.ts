import type { ColorPalette } from '../ColorPalette.ts';
import type { ColorPaletteSet } from '../ColorPaletteSet.ts';
import type DisplayMode from '../DisplayMode.ts';

export interface EditorCanvas<TRenderOptions extends Partial<Record<string, any>> = {}> {
    show(): void;
    render(options: TRenderOptions): void;
}

export interface SharedCanvasSettings {
    magnificationScale: number;
    width: number;
    height: number;
    pixelWidth: number;
    pixelHeight: number;
    paletteSet: ColorPaletteSet;
    palette: ColorPalette;
    displayMode: DisplayMode;
}
