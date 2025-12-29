import { ColorPickerAtari7800 } from './ColorPickerAtari7800.ts';
import type { ColorPickerBase, ColorPickerBaseOptions } from './ColorPickerBase.ts';
import { ColorPickerRGB } from './ColorPickerRGB.ts';
import type { ColorPaletteType } from './colors.ts';
import { nope } from './utils.ts';

export class ColorPicker {
    private static instanceRGB: ColorPickerRGB = new ColorPickerRGB();
    private static instanceA7800: ColorPickerAtari7800 = new ColorPickerAtari7800();

    public static create<T extends ColorPaletteType>(type: T, options?: ColorPickerBaseOptions): ColorPickerBase {
        let picker: ColorPickerBase;
        switch (type) {
            case 'rgb':
                picker = this.instanceRGB;
                break;
            case 'atari7800':
                picker = this.instanceA7800;
                break;
            case 'nes':
            case 'pico8':
                throw new Error('not implemented yet');
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
