import { type ColorValue, get2dContext } from '../utils.ts';
import { BaseCanvas } from './BaseCanvas.ts';

export class BackgroundCanvas extends BaseCanvas {
    private static transparentPatternMap: Record<number, CanvasPattern> = {};
    public static readonly transparentColor1 = '#8f8f8f';
    public static readonly transparentColor2 = '#a8a8a8';

    protected get canvasClassName(): string[] {
        return [ 'editor-bg' ];
    }

    public getName(): string {
        return 'BackgroundCanvas';
    }

    private getTransparentPattern(): CanvasPattern {
        const key = this.magnificationScale;
        let pattern = BackgroundCanvas.transparentPatternMap[key] || null;

        if (!pattern) {
            const $canvas = document.createElement('canvas');
            $canvas.width = 16 * this.magnificationScale;
            $canvas.height = 16 * this.magnificationScale;

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

    private getPatternForColor(color: ColorValue): string | CanvasPattern {
        switch (color) {
            case 'background':
                return this.backgroundColor.hex;
            case 'transparent':
                return this.getTransparentPattern();
            default: {
                const { palette, index } = color;
                return palette.getColorAt(index).hex;
            }
        }
    }

    public render(): void {
        const ctx = this.ctx;

        this.logger.debug('rendering');

        this.clearAll();

        let fillStyle: string | CanvasPattern;

        if (this.editorSettings.uncoloredPixelBehavior === 'background') {
            fillStyle = this.backgroundColor.hex;
        } else {
            const color0 = this.getColors()[0];
            if (!color0) {
                fillStyle = this.getTransparentPattern();
            } else {
                const colors = color0.colors;
                if (colors.length > 1 && colors.some(color => color.value !== 'transparent')) {
                    const canvas = document.createElement('canvas');
                    canvas.width = this.internalPixelWidth;
                    canvas.height = this.internalPixelHeight;

                    const ctx = get2dContext(canvas);

                    colors.forEach((color, i) => {
                        if (color.value === 'transparent') {
                            // this isn't really supported, although it falls back to something
                            this.logger.error('trying to render bg pixel with partial transparency');
                        }
                        ctx.fillStyle = this.getPatternForColor(color.value);
                        ctx.fillRect(i * (canvas.width / colors.length), 0, canvas.width / colors.length, canvas.height);
                    });

                    const pattern = ctx.createPattern(canvas, 'repeat');
                    if (!pattern) {
                        throw new Error('Failed to create pattern');
                    }

                    fillStyle = pattern;
                } else {
                    fillStyle = this.getPatternForColor(colors[0]?.value || 'transparent');
                }
            }
        }

        ctx.fillStyle = fillStyle;
        ctx.fillRect(0, 0, this.$el.width, this.$el.height);
    }
}
