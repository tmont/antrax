import colorsJson from './data/colors.json';

export interface Atari7800Color {
    readonly index: number;
    readonly r: number;
    readonly g: number;
    readonly b: number;
    readonly hex: string;
}

export type Atari7800ColorList = readonly [
    Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color,
    Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color,
    Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color,
    Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color,
    Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color,
    Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color,
    Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color,
    Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color,
    Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color,
    Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color,
    Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color,
    Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color,
    Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color,
    Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color,
    Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color,
    Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color,
    Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color,
    Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color,
    Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color,
    Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color,
    Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color,
    Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color,
    Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color,
    Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color,
    Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color,
    Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color,
    Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color,
    Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color,
    Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color,
    Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color,
    Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color,
    Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color, Atari7800Color
];

export const colors: Atari7800ColorList = colorsJson as any;

export type ColorSerialized = number;

export const colorToJson = (color: Atari7800Color): ColorSerialized => {
    return color.index;
};

export const getColorObject = (value: Atari7800Color | number | undefined, fallback: Atari7800Color): Atari7800Color => {
    if (typeof value === 'number') {
        return colors[value] || fallback;
    }
    if (value) {
        return value;
    }

    return fallback;
};
