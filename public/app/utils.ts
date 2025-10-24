export const nope = (x: never) => {};

export interface Dimensions {
    width: number;
    height: number;
}

export interface Coordinate {
    x: number;
    y: number;
}

export type PixelColor = string | null;

export interface PixelInfo {
    color: PixelColor;
}
