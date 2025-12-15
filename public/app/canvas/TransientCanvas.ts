import { BaseCanvas } from './BaseCanvas.ts';

// TODO move all the crazy-ass logic from PixelCanvas into here...
export class TransientCanvas extends BaseCanvas {
    protected get canvasClassName(): string[] {
        return [ 'editor-transient' ];
    }

    public getName(): string {
        return 'TransientCanvas';
    }

    public show(): void {
        if (this.$el.parentNode !== this.$frameContainer) {
            this.$frameContainer.appendChild(this.$el);
        }
    }

    public render(): void {}
}
