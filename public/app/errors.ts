export type SerializationContext =
    'Editor' |
    'Project' |
    'ColorPaletteSet' |
    'ObjectGroup' |
    'ObjectGroupItem' |
    'PixelCanvas';

export class SerializationError extends Error {}

export class SerializationTypeError extends SerializationError {
    public constructor(context: SerializationContext, name: string, type: string, actual?: unknown) {
        super(`[${context}] "${name}" must be a${/^[aeiou]/.test(type) ? 'n' : ''} ` +
            `${type}${typeof actual !== 'undefined' ? `, got "${typeof actual}"` : ''}`);
    }
}
