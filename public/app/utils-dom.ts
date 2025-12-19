const parser = new DOMParser();
export const parseTemplate = (html: string): HTMLElement => {
    const el = parser.parseFromString(html, 'text/html').body.firstChild;
    if (!(el instanceof HTMLElement)) {
        throw new Error('Failed to parse HTML template');
    }

    return el;
};

export const findOrDie = <T>(ancestor: ParentNode, selector: string, predicate: (node: unknown) => node is T): T => {
    const child = ancestor.querySelector(selector);
    if (!predicate(child)) {
        throw new Error(`Unable to find ${selector}`);
    }

    return child;
};

export const findElement = (ancestor: ParentNode, selector: string): HTMLElement =>
    findOrDie(ancestor, selector, node => node instanceof HTMLElement);
export const findInput = (ancestor: ParentNode, selector: string): HTMLInputElement =>
    findOrDie(ancestor, selector, node => node instanceof HTMLInputElement);
export const findSelect = (ancestor: ParentNode, selector: string): HTMLSelectElement =>
    findOrDie(ancestor, selector, node => node instanceof HTMLSelectElement);
export const findCanvas = (ancestor: ParentNode, selector: string): HTMLCanvasElement =>
    findOrDie(ancestor, selector, node => node instanceof HTMLCanvasElement);
export const findButton = (ancestor: ParentNode, selector: string): HTMLButtonElement =>
    findOrDie(ancestor, selector, node => node instanceof HTMLButtonElement);
export const findTemplateContent = (ancestor: ParentNode, selector: string): DocumentFragment =>
    findOrDie(ancestor, selector, node => node instanceof HTMLTemplateElement).content;

export const setTextAndTitle = ($el: HTMLElement, text: string): void => {
    $el.innerText = text;
    $el.setAttribute('title', text);
};
