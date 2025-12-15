import { get2dContext } from '../utils.ts';
import { BaseCanvas } from './BaseCanvas.ts';

export class BackgroundCanvas extends BaseCanvas {
    private static transparentPatternMap: Record<string, CanvasPattern> = {};
    public static readonly transparentColor1 = '#8f8f8f';
    public static readonly transparentColor2 = '#a8a8a8';

    protected get canvasClassName(): string[] {
        return [ 'editor-bg' ];
    }

    public getName(): string {
        return 'BackgroundCanvas';
    }

    private getTransparentPattern(): CanvasPattern {
        const key = `${this.editorSettings.zoomLevel}:${this.pixelWidth}x${this.pixelHeight}`;
        let pattern = BackgroundCanvas.transparentPatternMap[key] || null;

        if (!pattern) {
            const $canvas = document.createElement('canvas');
            $canvas.width = Math.max(2, this.internalPixelWidth);
            $canvas.height = Math.max(2, this.internalPixelHeight);

            const ctx = get2dContext($canvas);

            ctx.fillStyle = BackgroundCanvas.transparentColor1;
            ctx.fillRect(0, 0, $canvas.width / 2, $canvas.height / 2);
            ctx.fillRect($canvas.width / 2, $canvas.height / 2, $canvas.width / 2, $canvas.height / 2);
            ctx.fillStyle = BackgroundCanvas.transparentColor2;
            ctx.fillRect($canvas.width / 2, 0, $canvas.width / 2, $canvas.height / 2);
            ctx.fillRect(0, $canvas.height / 2, $canvas.width / 2, $canvas.height / 2);

            pattern = this.ctx.createPattern($canvas, 'repeat');
            if (!pattern) {
                throw new Error(`could not create transparent pattern`);
            }

            BackgroundCanvas.transparentPatternMap[key] = pattern;
        }

        return pattern;
    }

    public show(): void {
        if (this.$el.parentNode !== this.$frameContainer) {
            this.$frameContainer.appendChild(this.$el);
        }
    }

    public render(): void {
        const ctx = this.ctx;

        this.logger.debug('rendering');

        this.clearAll();
        // ctx.clearRect(0, 0, this.$el.width, this.$el.height);

        let fillStyle: string | CanvasPattern;

        if (this.editorSettings.uncoloredPixelBehavior === 'background') {
            fillStyle = this.backgroundColor.hex;
        } else {
            const color0 = this.getColors()[0];
            if (!color0) {
                fillStyle = this.getTransparentPattern();
            } else {
                const colors = color0.colors;
                const canvas = document.createElement('canvas');
                canvas.width = this.internalPixelWidth;
                canvas.height = this.internalPixelHeight;

                const ctx = get2dContext(canvas);

                colors.forEach((color, i) => {
                    switch (color.value) {
                        case 'background':
                            ctx.fillStyle = this.backgroundColor.hex;
                            break;
                        case 'transparent':
                            ctx.fillStyle = this.getTransparentPattern();
                            break;
                        default: {
                            const { palette, index } = color.value;
                            ctx.fillStyle = palette.getColorAt(index).hex;
                            break;
                        }
                    }

                    ctx.fillRect(i * (canvas.width / colors.length), 0, canvas.width / colors.length, canvas.height);
                });

                const pattern = ctx.createPattern(canvas, 'repeat');
                if (!pattern) {
                    throw new Error('Failed to create pattern');
                }

                fillStyle = pattern;
            }
        }

        ctx.fillStyle = fillStyle;
        ctx.fillRect(0, 0, this.$el.width, this.$el.height);
    }
}
