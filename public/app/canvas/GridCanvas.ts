import { BaseCanvas } from './BaseCanvas.ts';

export class GridCanvas extends BaseCanvas {
    protected get canvasClassName(): string[] {
        return [ 'editor-grid' ];
    }

    public getName(): string {
        return 'GridCanvas';
    }

    public show(): void {
        if (this.$el.parentNode !== this.$frameContainer) {
            this.$frameContainer.appendChild(this.$el);
        }
    }

    public render(): void {
        const ctx = this.ctx;

        this.logger.debug('rendering');

        const width = this.$el.width;
        const height = this.$el.height;
        ctx.clearRect(0, 0, width, height);
        if (!this.editorSettings.showGrid) {
            return;
        }

        ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i <= width; i += this.internalPixelWidth) {
            ctx.moveTo(i, 0);
            ctx.lineTo(i, height);
        }

        for (let i = 0; i <= height; i += this.internalPixelHeight) {
            ctx.moveTo(0, i);
            ctx.lineTo(width, i);
        }

        ctx.stroke();
    }
}
