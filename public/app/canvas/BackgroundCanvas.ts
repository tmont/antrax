import { type ColorValue, type DisplayModeColor, get2dContext, type Rect } from '../utils.ts';
import { BaseCanvas } from './BaseCanvas.ts';

export class BackgroundCanvas extends BaseCanvas {
    private static transparentPatternMap: Record<number, CanvasPattern> = {};
    public static readonly transparentColor1 = '#8f8f8f';
    public static readonly transparentColor2 = '#a8a8a8';
    public static readonly checkerboardSize = 16;

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
            $canvas.width = BackgroundCanvas.checkerboardSize * this.magnificationScale;
            $canvas.height = BackgroundCanvas.checkerboardSize * this.magnificationScale;

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

    /**
     * Renders a single background pixel, handling checkerboard offsets
     */
    public renderPixelOnto(ctx: CanvasRenderingContext2D, rect: Rect): void {
        const { x, y, width, height } = rect;

        if (this.editorSettings.uncoloredPixelBehavior === 'background') {
            ctx.fillStyle = this.backgroundColor.hex;
            ctx.fillRect(x, y, width, height);
            return;
        }

        const color0 = this.getColors()[0];
        if (!color0 || (color0.colors.length === 1 && color0.colors[0]?.value === 'transparent')) {
            // fully transparent, render checkerboard.
            // the checkerboard is a fixed size: it does not scale with pixel dimensions or zoom level,
            // so we must do math to render "partial" checkerboards in some cases.
            const squareSize = BackgroundCanvas.checkerboardSize * this.magnificationScale / 2;

            const maxX = x + width;
            const maxY = y + height;

            for (let i = x; i < x + width;) {
                const xVal = Math.floor(i / squareSize) % 2;
                const realWidth = Math.min(squareSize - (i % squareSize), maxX - i);
                for (let j = y; j < y + height;) {
                    const yVal = Math.floor(j / squareSize) % 2;
                    ctx.fillStyle = xVal === yVal ? BackgroundCanvas.transparentColor1 : BackgroundCanvas.transparentColor2;

                    const realHeight = Math.min(squareSize - (j % squareSize), maxY - j);
                    ctx.fillRect(i, j, realWidth, realHeight);

                    j += realHeight;
                }

                i += realWidth;
            }
            return;
        }

        this.renderMultiColoredPixel(ctx, color0.colors, rect);
    }

    private renderMultiColoredPixel(ctx: CanvasRenderingContext2D, colors: DisplayModeColor[], rect: Rect): void {
        const { x, y, width, height } = rect;

        colors.forEach((color, i) => {
            if (color.value === 'transparent') {
                // this isn't really supported, although it falls back to something
                // the checkerboard will (potentially) not be offset correctly if pixel dimensions aren't
                // a multiple of (checkerboardSize / 2).
                this.logger.error('trying to render bg pixel with partial transparency');
            }
            ctx.fillStyle = this.getPatternForColor(color.value);
            ctx.fillRect(x + (i * (width / colors.length)), y, width / colors.length, height);
        });
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

                    this.renderMultiColoredPixel(ctx, colors, {
                        x: 0,
                        y: 0,
                        width: canvas.width,
                        height: canvas.height,
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
