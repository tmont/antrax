import colorsJson from './data/colors.json';

export interface RGBValues {
    r: number;
    g: number;
    b: number;
}

export interface RGBColor extends RGBValues {
    hex: string;
}

export const hexToRGB = (hex: string): IndexedRGBColor => {
    let [ r, g, b ] = (/^#?([a-f0-9]{2})([a-f0-9]{2})([a-f0-9]{2})$/.exec(hex) || [ '0', '0', '0' ]).map(hex => parseInt(hex, 16));
    r = r || 0;
    g = g || 0;
    b = b || 0;
    return {
        r,
        g,
        b,
        hex,
        index: getRGBIndex({ r, g, b }),
    };
};

export interface IndexedRGBColor extends Readonly<RGBColor> {
    readonly index: number;
}

export type Atari7800ColorList = readonly [
    IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor,
    IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor,
    IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor,
    IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor,
    IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor,
    IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor,
    IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor,
    IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor,
    IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor,
    IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor,
    IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor,
    IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor,
    IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor,
    IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor,
    IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor,
    IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor,
    IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor,
    IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor,
    IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor,
    IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor,
    IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor,
    IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor,
    IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor,
    IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor,
    IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor,
    IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor,
    IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor,
    IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor,
    IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor,
    IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor,
    IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor,
    IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor, IndexedRGBColor
];

export const colors: Atari7800ColorList = colorsJson as any;

// export const pico8Colors: IndexedRGBColor[] = [
//     { r: 0, g: 0, b: 0, hex: '#000000', index: 0 },
//     { r: 29, g: 43, b: 83, hex: '#1d2b53', index: 1 },
//     { r: 126, g: 37, b: 83, hex: '#7e2553', index: 2 },
//     { r: 0, g: 135, b: 81, hex: '#008751', index: 3 },
//     { r: 171, g: 82, b: 54, hex: '#ab5236', index: 4 },
//     { r: 95, g: 87, b: 79, hex: '#5f574f', index: 5 },
//     { r: 194, g: 195, b: 199, hex: '#c2c3c7', index: 6 },
//     { r: 255, g: 241, b: 232, hex: '#fff1e8', index: 7 },
//     { r: 255, g: 0, b: 77, hex: '#ff004d', index: 8 },
//     { r: 255, g: 163, b: 0, hex: '#ffa300', index: 9 },
//     { r: 255, g: 236, b: 39, hex: '#ffff27', index: 10 },
//     { r: 0, g: 228, b: 54, hex: '#00e756', index: 11 },
//     { r: 41, g: 173, b: 255, hex: '#29adff', index: 12 },
//     { r: 131, g: 118, b: 156, hex: '#83769c', index: 13 },
//     { r: 255, g: 119, b: 168, hex: '#ff77a8', index: 14 },
//     { r: 255, g: 204, b: 170, hex: '#ffccaa', index: 15 },
// ];
//
// export const nesColors: IndexedRGBColor[] = [
//
// ];

export type Atari7800ColorSerialized = IndexedRGBColor['index'];
export type RGBColorSerialized = RGBColor['hex'];
export type ColorSerialized = Atari7800ColorSerialized | RGBColorSerialized;

// noinspection SuspiciousTypeOfGuard
export const isAtari7800Color = (color: any): color is IndexedRGBColor =>
    !!color && typeof (color as IndexedRGBColor).index === 'number';

export const colorToJson = (color: RGBColor): ColorSerialized => isAtari7800Color(color) ? color.index : color.hex;

export const getA7800ColorObject = (value: IndexedRGBColor | ColorSerialized | undefined): IndexedRGBColor | null => {
    if (typeof value === 'number') {
        // serialized atari 7800 color
        return colors[value] || null;
    }

    if (typeof value === 'string') {
        // serialized rgb color
        return hexToRGB(value);
    }

    return value || null;
};

export interface HSLColor {
    h: number;
    s: number;
    l: number;
}

export interface HSVColor {
    h: number;
    s: number;
    v: number;
}

interface XYZColor {
    x: number;
    y: number;
    z: number;
}

interface LabColor {
    l: number;
    a: number;
    b: number;
}

const rgbToHCV = (rgb: RGBValues): { h: number; c: number; v: number } => {
    let { r, g, b } = rgb;
    r /= 255;
    g /= 255;
    b /= 255;

    const v = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const c = v - min;
    const l = (v + min) / 2;

    let h = c === 0 ? 0 :
        (v === r ? 60 * (((g - b) / c) % 6) :
            (v === g ? 60 * (((b - r) / c) + 2) :
                (v === b ? 60 * (((r - g) / c) + 4) : 0)
            )
        );

    h = (h + 360) % 360;

    return {
        h,
        c,
        v,
    };
};

export const rgbToHSL = (rgb: RGBValues): HSLColor => {
    const { h, c, v } = rgbToHCV(rgb);
    const l = v - (c / 2);

    return {
        h,
        s: l === 0 || l === 1 ? 0 : (v - l) / Math.min(l, 1 - l),
        l,
    };
};


export const rgbToHSV = (rgb: RGBValues): HSVColor => {
    const { h, c, v } = rgbToHCV(rgb);

    return {
        h,
        s: v === 0 ? 0 : c / v,
        v,
    };
};

/**
 * @see https://en.wikipedia.org/wiki/HSL_and_HSV#HSL_to_RGB_alternative
 */
export const hslToRGB = ({ h, s, l }: HSLColor): RGBValues => {
    const a = s * Math.min(l, 1 - l);
    const k = (n: number) => (n + (h / 30)) % 12;
    const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));

    return {
        r: f(0) * 255,
        g: f(8) * 255,
        b: f(4) * 255,
    };
};

/**
 * @see https://en.wikipedia.org/wiki/HSL_and_HSV#HSV_to_RGB_alternative
 */
export const hsvToRGB = ({ h, s, v }: HSVColor): RGBValues => {
    const k = (n: number) => (n + (h / 60)) % 6;
    const f = (n: number) => v - v * s * Math.max(0, Math.min(k(n), 4 - k(n), 1));

    return {
        r: f(5) * 255,
        g: f(3) * 255,
        b: f(1) * 255,
    };
};

const rgbToXYZ = ({ r, g, b }: RGBValues): XYZColor => {
    let r1 = r / 255;
    let g1 = g / 255;
    let b1 = b / 255;

    if (r1 > 0.04045) {
        r1 = ((r1 + 0.055) / 1.055) ** 2.4;
    } else {
        r1 = r1 / 12.92;
    }
    if (g1 > 0.04045) {
        g1 = ((g1 + 0.055) / 1.055) ** 2.4;
    } else {
        g1 = g1 / 12.92;
    }
    if (b1 > 0.04045) {
        b1 = ((b1 + 0.055) / 1.055) ** 2.4;
    } else {
        b1 = b1 / 12.92;
    }

    r1 *= 100;
    g1 *= 100;
    b1 *= 100;

    return {
        x: (r1 * 0.4124) + (g1 * 0.3576) + (b1 * 0.1805),
        y: (r1 * 0.2126) + (g1 * 0.7152) + (b1 * 0.0722),
        z: (r1 * 0.0193) + (g1 * 0.1192) + (b1 * 0.9505),
    };
};

const xyzToLab = ({ x, y, z }: XYZColor): LabColor => {
    // D65 - https://en.wikipedia.org/wiki/Standard_illuminant#D65_values
    const refX = 95.047;
    const refY = 100;
    const refZ = 108.883;

    let x1 = x / refX;
    let y1 = y / refY;
    let z1 = z / refZ;

    if (x1 > 0.008856) {
        x1 = x1 ** (1/3);
    } else {
        x1 = (7.787 * x1) + (16 / 116);
    }
    if (y1 > 0.008856) {
        y1 = y1 ** (1 / 3);
    } else {
        y1 = (7.787 * y1) + (16 / 116);
    }
    if (z1 > 0.008856) {
        z1 = z1 ** (1 / 3);
    } else {
        z1 = (7.787 * z1) + (16 / 116);
    }

    return {
        l: (116 * y1) - 16,
        a: 500 * (x1 - y1),
        b: 200 * (y1 - z1),
    };
};

export const convertToClosestColor = (rgb: RGBValues, colors: IndexedRGBColor[]): IndexedRGBColor => {
    const { l: l1, a: a1, b: b1 } = xyzToLab(rgbToXYZ(rgb));

    let closest = colors[0];
    if (!closest) {
        throw new Error(`no colors found for conversion`);
    }
    let best = Infinity;
    colors.forEach((color) => {
        const { l, a, b } = xyzToLab(rgbToXYZ(color));
        const lDist = (l - l1) ** 2;
        const aDist = (a - a1) ** 2;
        const bDist = (b - b1) ** 2;

        const dist = Math.sqrt(lDist + aDist + bDist);
        if (dist < best) {
            best = dist;
            closest = color;
        }
    });

    return closest;
};

export const getRGBIndex = ({ r, g, b }: RGBValues) => (r << 16) | (g << 8) | b;

export const convertToIndexed = (color: RGBValues): IndexedRGBColor => {
    return {
        r: color.r,
        g: color.g,
        b: color.b,
        hex: rgbToHex(color),
        index: getRGBIndex(color),
    }
};

export type ColorPaletteType = 'atari7800' | 'rgb' | 'nes' | 'pico8';

export const rgbToHex = ({ r, g, b }: Omit<RGBColor, 'hex'>): string =>
    '#' + [ r, g, b ].map(x => '0'.repeat(Math.round(x) < 16 ? 1 : 0) + Math.round(x).toString(16)).join('');
