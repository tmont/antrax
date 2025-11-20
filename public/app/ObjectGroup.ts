import type { ColorPaletteSet } from './ColorPaletteSet.ts';
import type { Atari7800Color } from './colors.ts';
import { type SerializationContext, SerializationTypeError } from './errors.ts';
import { generateId } from './utils.ts';

export interface ObjectGroupOptions {
    id?: ObjectGroup['id'];
    name?: string;
    paletteSet: ColorPaletteSet;
}

export interface ObjectGroupSerialized {
    id: string | number;
    name: ObjectGroup['name'];
    paletteSetId: string | number;
}

export class ObjectGroup {
    public readonly id: string;
    private name: string;
    private paletteSet: ColorPaletteSet;

    private static instanceCount = 0;

    public constructor(options: ObjectGroupOptions) {
        ObjectGroup.instanceCount++;
        this.id = options.id || generateId();
        this.name = options.name || `Group ${ObjectGroup.instanceCount}`;
        this.paletteSet = options.paletteSet;
    }

    public getName(): string {
        return this.name;
    }

    public setName(newName: string): void {
        this.name = newName || `Group ${this.id}`;
    }

    public getPaletteSet(): ColorPaletteSet {
        return this.paletteSet;
    }

    public getBackgroundColor(): Readonly<Atari7800Color> {
        return this.paletteSet.getBackgroundColor();
    }

    public toJSON(): ObjectGroupSerialized {
        return {
            id: this.id,
            name: this.name,
            paletteSetId: this.paletteSet.id,
        };
    }

    public static fromJSON(
        json: object,
        paletteSets: Readonly<ColorPaletteSet[]>,
    ): ObjectGroup {
        this.ensureSerialized(json);

        const paletteSet = paletteSets.find(set => set.id === String(json.paletteSetId));
        if (!paletteSet) {
            throw new Error(`Cannot deserialize ObjectGroup, palette set with ID "${json.paletteSetId}" not found`);
        }
        return new ObjectGroup({
            id: String(json.id),
            name: json.name,
            paletteSet: paletteSet,
        });
    }

    public static ensureSerialized(json: any): asserts json is ObjectGroupSerialized {
        const context: SerializationContext = 'ObjectGroup';

        if (!json.id || (typeof json.id !== 'string' && typeof json.id !== 'number')) {
            throw new SerializationTypeError(context, 'id', 'non-empty string or number', json.id);
        }
        if (typeof json.name !== 'string') {
            throw new SerializationTypeError(context, 'name', 'string', json.name);
        }
        if (!json.paletteSetId || (typeof json.paletteSetId !== 'string' && typeof json.paletteSetId !== 'number')) {
            throw new SerializationTypeError(context, 'paletteSetId', 'non-empty string or number number', json.paletteSetId);
        }
    }
}
