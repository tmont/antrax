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

/**
 * @see https://pico-8.fandom.com/wiki/Palette
 */
export const pico8Colors: Readonly<IndexedRGBColor[]> = [
    { r: 0, g: 0, b: 0, hex: '#000000', index: 0 },
    { r: 29, g: 43, b: 83, hex: '#1d2b53', index: 1 },
    { r: 126, g: 37, b: 83, hex: '#7e2553', index: 2 },
    { r: 0, g: 135, b: 81, hex: '#008751', index: 3 },
    { r: 171, g: 82, b: 54, hex: '#ab5236', index: 4 },
    { r: 95, g: 87, b: 79, hex: '#5f574f', index: 5 },
    { r: 194, g: 195, b: 199, hex: '#c2c3c7', index: 6 },
    { r: 255, g: 241, b: 232, hex: '#fff1e8', index: 7 },
    { r: 255, g: 0, b: 77, hex: '#ff004d', index: 8 },
    { r: 255, g: 163, b: 0, hex: '#ffa300', index: 9 },
    { r: 255, g: 236, b: 39, hex: '#ffff27', index: 10 },
    { r: 0, g: 228, b: 54, hex: '#00e756', index: 11 },
    { r: 41, g: 173, b: 255, hex: '#29adff', index: 12 },
    { r: 131, g: 118, b: 156, hex: '#83769c', index: 13 },
    { r: 255, g: 119, b: 168, hex: '#ff77a8', index: 14 },
    { r: 255, g: 204, b: 170, hex: '#ffccaa', index: 15 },

    // "hidden" colors
    { r: 41, g: 24, b: 20, hex: '#291814', index: 128 },
    { r: 17, g: 29, b: 53, hex: '#111D35', index: 129 },
    { r: 66, g: 33, b: 54, hex: '#422136', index: 130 },
    { r: 18, g: 83, b: 89, hex: '#125359', index: 131 },
    { r: 116, g: 47, b: 41, hex: '#742F29', index: 132 },
    { r: 73, g: 51, b: 59, hex: '#49333B', index: 133 },
    { r: 162, g: 136, b: 121, hex: '#A28879', index: 134 },
    { r: 243, g: 239, b: 125, hex: '#F3EF7D', index: 135 },
    { r: 190, g: 18, b: 80, hex: '#BE1250', index: 136 },
    { r: 255, g: 108, b: 36, hex: '#FF6C24', index: 137 },
    { r: 168, g: 231, b: 46, hex: '#A8E72E', index: 138 },
    { r: 0, g: 181, b: 67, hex: '#00B543', index: 139 },
    { r: 6, g: 90, b: 181, hex: '#065AB5', index: 140 },
    { r: 117, g: 70, b: 101, hex: '#754665', index: 141 },
    { r: 255, g: 110, b: 89, hex: '#FF6E59', index: 142 },
    { r: 255, g: 157, b: 129, hex: '#FF9D81', index: 143 },
];

/**
 * @see http://www.romdetectives.com/Wiki/index.php?title=NES_Palette
 */
export const nesColors: Readonly<IndexedRGBColor[]> = [
    { r: 124, g: 124, b: 124, hex: '#7C7C7C', index: 0 },
    { r: 0, g: 0, b: 252, hex: '#0000FC', index: 1 },
    { r: 0, g: 0, b: 188, hex: '#0000BC', index: 2 },
    { r: 68, g: 40, b: 188, hex: '#4428BC', index: 3 },
    { r: 148, g: 0, b: 132, hex: '#940084', index: 4 },
    { r: 168, g: 0, b: 32, hex: '#A80020', index: 5 },
    { r: 168, g: 16, b: 0, hex: '#A81000', index: 6 },
    { r: 136, g: 20, b: 0, hex: '#881400', index: 7 },
    { r: 80, g: 48, b: 0, hex: '#503000', index: 8 },
    { r: 0, g: 120, b: 0, hex: '#007800', index: 9 },
    { r: 0, g: 104, b: 0, hex: '#006800', index: 10 },
    { r: 0, g: 88, b: 0, hex: '#005800', index: 11 },
    { r: 0, g: 64, b: 88, hex: '#004058', index: 12 },
    { r: 0, g: 0, b: 0, hex: '#000000', index: 13 },
    { r: 0, g: 0, b: 0, hex: '#000000', index: 14 },
    { r: 0, g: 0, b: 0, hex: '#000000', index: 15 },
    { r: 188, g: 188, b: 188, hex: '#BCBCBC', index: 16 },
    { r: 0, g: 120, b: 248, hex: '#0078F8', index: 17 },
    { r: 0, g: 88, b: 248, hex: '#0058F8', index: 18 },
    { r: 104, g: 68, b: 252, hex: '#6844FC', index: 19 },
    { r: 216, g: 0, b: 204, hex: '#D800CC', index: 20 },
    { r: 228, g: 0, b: 88, hex: '#E40058', index: 21 },
    { r: 248, g: 56, b: 0, hex: '#F83800', index: 22 },
    { r: 228, g: 92, b: 16, hex: '#E45C10', index: 23 },
    { r: 172, g: 124, b: 0, hex: '#AC7C00', index: 24 },
    { r: 0, g: 184, b: 0, hex: '#00B800', index: 25 },
    { r: 0, g: 168, b: 0, hex: '#00A800', index: 26 },
    { r: 0, g: 168, b: 68, hex: '#00A844', index: 27 },
    { r: 0, g: 136, b: 136, hex: '#008888', index: 28 },
    { r: 0, g: 0, b: 0, hex: '#000000', index: 29 },
    { r: 0, g: 0, b: 0, hex: '#000000', index: 30 },
    { r: 0, g: 0, b: 0, hex: '#000000', index: 31 },
    { r: 248, g: 248, b: 248, hex: '#F8F8F8', index: 32 },
    { r: 60, g: 188, b: 252, hex: '#3CBCFC', index: 33 },
    { r: 104, g: 136, b: 252, hex: '#6888FC', index: 34 },
    { r: 152, g: 120, b: 248, hex: '#9878F8', index: 35 },
    { r: 248, g: 120, b: 248, hex: '#F878F8', index: 36 },
    { r: 248, g: 88, b: 152, hex: '#F85898', index: 37 },
    { r: 248, g: 120, b: 88, hex: '#F87858', index: 38 },
    { r: 252, g: 160, b: 68, hex: '#FCA044', index: 39 },
    { r: 248, g: 184, b: 0, hex: '#F8B800', index: 40 },
    { r: 184, g: 248, b: 24, hex: '#B8F818', index: 41 },
    { r: 88, g: 216, b: 84, hex: '#58D854', index: 42 },
    { r: 88, g: 248, b: 152, hex: '#58F898', index: 43 },
    { r: 0, g: 232, b: 216, hex: '#00E8D8', index: 44 },
    { r: 120, g: 120, b: 120, hex: '#787878', index: 45 },
    { r: 0, g: 0, b: 0, hex: '#000000', index: 46 },
    { r: 0, g: 0, b: 0, hex: '#000000', index: 47 },
    { r: 252, g: 252, b: 252, hex: '#FCFCFC', index: 48 },
    { r: 164, g: 228, b: 252, hex: '#A4E4FC', index: 49 },
    { r: 184, g: 184, b: 248, hex: '#B8B8F8', index: 50 },
    { r: 216, g: 184, b: 248, hex: '#D8B8F8', index: 51 },
    { r: 248, g: 184, b: 248, hex: '#F8B8F8', index: 52 },
    { r: 248, g: 164, b: 192, hex: '#F8A4C0', index: 53 },
    { r: 240, g: 208, b: 176, hex: '#F0D0B0', index: 54 },
    { r: 252, g: 224, b: 168, hex: '#FCE0A8', index: 55 },
    { r: 248, g: 216, b: 120, hex: '#F8D878', index: 56 },
    { r: 216, g: 248, b: 120, hex: '#D8F878', index: 57 },
    { r: 184, g: 248, b: 184, hex: '#B8F8B8', index: 58 },
    { r: 184, g: 248, b: 216, hex: '#B8F8D8', index: 59 },
    { r: 0, g: 252, b: 252, hex: '#00FCFC', index: 60 },
    { r: 248, g: 216, b: 248, hex: '#F8D8F8', index: 61 },
    { r: 0, g: 0, b: 0, hex: '#000000', index: 62 },
    { r: 0, g: 0, b: 0, hex: '#000000', index: 63 },
];

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

export const convertToClosestColor = (rgb: RGBValues, colors: Readonly<IndexedRGBColor[]>): IndexedRGBColor => {
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

export type ColorPaletteTypeFinite = 'atari7800' | 'nes' | 'pico8';
export type ColorPaletteType = 'rgb' | ColorPaletteTypeFinite;

export const rgbToHex = ({ r, g, b }: Omit<RGBColor, 'hex'>): string =>
    '#' + [ r, g, b ].map(x => '0'.repeat(Math.round(x) < 16 ? 1 : 0) + Math.round(x).toString(16)).join('');
