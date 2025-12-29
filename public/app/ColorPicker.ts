import { ColorPickerGrid } from './ColorPickerGrid.ts';
import type { ColorPickerBase, ColorPickerBaseOptions } from './ColorPickerBase.ts';
import { ColorPickerRGB } from './ColorPickerRGB.ts';
import { type ColorPaletteType, colors, nesColors, pico8Colors } from './colors.ts';
import { nope } from './utils.ts';

export class ColorPicker {
    private static instanceRGB: ColorPickerRGB = new ColorPickerRGB();
    private static instanceA7800: ColorPickerGrid = new ColorPickerGrid({
        type: 'atari7800',
        cols: 16,
        rows: 16,
        colors: colors,
    });
    private static instancePico8: ColorPickerGrid = new ColorPickerGrid({
        type: 'pico8',
        cols: 16,
        rows: 2,
        colors: pico8Colors,
    });
    private static instanceNES: ColorPickerGrid = new ColorPickerGrid({
        type: 'nes',
        cols: 16,
        rows: 4,
        colors: nesColors,
    });

    public static create(type: ColorPaletteType, options?: ColorPickerBaseOptions): ColorPickerBase {
        let picker: ColorPickerBase;
        switch (type) {
            case 'rgb':
                picker = this.instanceRGB;
                break;
            case 'atari7800':
                picker = this.instanceA7800;
                break;
            case 'pico8':
                picker = this.instancePico8;
                break;
            case 'nes':
                picker = this.instanceNES;
                break;
            default:
                nope(type);
                throw new Error(`unknown type "${type}"`);
        }

        picker.off();
        picker.setTitle(options?.title);
        picker.setActiveColor(options?.activeColor);

        return picker;
    }
}
