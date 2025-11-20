import type { ColorPaletteSet } from './ColorPaletteSet.ts';
import type { Atari7800Color } from './colors.ts';

export interface ObjectGroupOptions {
    id?: ObjectGroup['id'];
    name?: string;
    paletteSet: ColorPaletteSet;
}

export interface ObjectGroupSerialized {
    id: ObjectGroup['id'];
    name: ObjectGroup['name'];
    paletteSetId: ColorPaletteSet['id'];
}

export class ObjectGroup {
    public readonly id: number;
    private name: string;
    private paletteSet: ColorPaletteSet;

    private static instanceCount = 0;

    public constructor(options: ObjectGroupOptions) {
        ObjectGroup.instanceCount++;
        this.id = options.id || ObjectGroup.instanceCount;
        this.name = options.name || `Group ${this.id}`;
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
        if (!isSerialized(json)) {
            throw new Error('Cannot deserialize ObjectGroup, invalid JSON');
        }

        const paletteSet = paletteSets.find(set => set.id === json.paletteSetId);
        if (!paletteSet) {
            throw new Error(`Cannot deserialize ObjectGroup, palette set with ID "${json.paletteSetId}" not found`);
        }
        return new ObjectGroup({
            id: json.id,
            name: json.name,
            paletteSet: paletteSet,
        });
    }
}

const isSerialized = (json: any): json is ObjectGroupSerialized => {
    if (typeof json.id !== 'number') {
        return false;
    }
    if (typeof json.name !== 'string') {
        return false;
    }
    if (typeof json.paletteSetId !== 'number') {
        return false;
    }

    return true;
};
