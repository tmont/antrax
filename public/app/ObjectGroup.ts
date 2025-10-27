export class ObjectGroup {
    public readonly id: string;
    public name: string;

    private static instanceCount = 0;

    public constructor(name?: string) {
        ObjectGroup.instanceCount++;
        this.id = ObjectGroup.instanceCount.toString();
        this.name = name || `Group ${this.id}`;
    }
}
