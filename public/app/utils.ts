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

const parser = new DOMParser();
export const parseTemplate = (html: string): HTMLElement => {
    const el = parser.parseFromString(html, 'text/html').body.firstChild;
    if (!el) {
        throw new Error('Failed to parse HTML template');
    }

    return el as HTMLElement;
};

export const findOrDie = <T>(ancestor: ParentNode, selector: string, predicate: (node: unknown) => node is T): T => {
    const child = ancestor.querySelector(selector);
    if (!predicate(child)) {
        throw new Error(`Unable to find ${selector}`);
    }

    return child;
};
