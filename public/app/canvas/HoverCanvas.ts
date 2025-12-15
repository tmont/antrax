import { type Coordinate, get2dContext } from '../utils.ts';
import { BaseCanvas } from './BaseCanvas.ts';

interface RenderOptions extends Coordinate {
    erase?: boolean;
}

export class HoverCanvas extends BaseCanvas<{}, RenderOptions> {
    protected get canvasClassName(): string[] {
        return [ 'editor-hover' ];
    }

    public getName(): string {
        return 'HoverCanvas';
    }

    public show(): void {
        if (this.$el.parentNode !== this.$frameContainer) {
            this.$frameContainer.appendChild(this.$el);
        }
    }

    public render(options: RenderOptions): void {
        const { x, y } = this.convertPixelToCanvasCoordinate(options);

        if (options.erase) {
            this.clearAll();
        } else {
            this.drawHoverStyleRect(x, y, this.internalPixelWidth, this.internalPixelHeight);
        }
    }
}
