import type { ColorPalette } from '../ColorPalette.ts';
import type { ColorPaletteSet } from '../ColorPaletteSet.ts';
import type { RGBColor } from '../colors.ts';
import type DisplayMode from '../DisplayMode.ts';
import type { EditorSettings } from '../Editor.ts';
import { type EventArgMap, EventEmitter } from '../EventEmitter.ts';
import { Logger } from '../Logger.ts';
import { type Coordinate, type DisplayModeColorIndex, type DisplayModeColorValue, get2dContext } from '../utils.ts';
import type { EditorCanvas, SharedCanvasSettings } from './types.ts';

export interface BaseCanvasOptions {
    $frameContainer: HTMLElement;
    editorSettings: EditorSettings;
    canvasSettings: SharedCanvasSettings;
}

export abstract class BaseCanvas<T extends EventArgMap = {}, TRenderOptions extends Partial<Record<string, any>> = {}>
    extends EventEmitter<T> implements EditorCanvas {
    protected readonly $frameContainer: HTMLElement;
    protected readonly $el: HTMLCanvasElement;
    protected readonly ctx: CanvasRenderingContext2D;
    protected readonly logger: Logger;
    protected readonly editorSettings: EditorSettings;
    protected readonly settings: SharedCanvasSettings;

    protected constructor(options: BaseCanvasOptions) {
        super();

        this.$frameContainer = options.$frameContainer;
        this.editorSettings = options.editorSettings;
        this.settings = options.canvasSettings;
        this.$el = document.createElement('canvas');
        this.$el.classList.add(...this.canvasClassName);
        this.ctx = get2dContext(this.$el);
        this.logger = Logger.from(this);
    }

    protected get canvasClassName(): string[] {
        return [];
    }
    public abstract getName(): string;
    public abstract show(): void;
    public abstract render(options: TRenderOptions): void;

    public drawImageOnto(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number): void {
        context.drawImage(this.$el, x, y, width, height);
    }

    public getRenderingContext(): CanvasRenderingContext2D {
        return this.ctx;
    }

    protected get zoomLevel(): number {
        return this.editorSettings.zoomLevel;
    }

    public get magnificationScale(): number {
        return this.settings.magnificationScale;
    }

    public get width(): number {
        return this.settings.width;
    }

    public get height(): number {
        return this.settings.height;
    }

    public get pixelWidth(): number {
        return this.settings.pixelWidth;
    }

    public get pixelHeight(): number {
        return this.settings.pixelHeight;
    }

    public get displayPixelWidth(): number {
        return this.pixelWidth * this.zoomLevel;
    }

    public get displayPixelHeight(): number {
        return this.pixelHeight * this.zoomLevel;
    }

    public get displayWidth(): number {
        return this.width * this.displayPixelWidth;
    }

    public get displayHeight(): number {
        return this.height * this.displayPixelHeight;
    }

    public get internalPixelWidth(): number {
        return this.displayPixelWidth * this.magnificationScale;
    }

    public get internalPixelHeight(): number {
        return this.displayPixelHeight * this.magnificationScale;
    }

    public get internalWidth(): number {
        return this.displayWidth * this.magnificationScale;
    }

    public get internalHeight(): number {
        return this.displayHeight * this.magnificationScale;
    }

    public get backgroundColor(): RGBColor {
        return this.settings.paletteSet.getBackgroundColor();
    }

    public getColors(): DisplayModeColorValue[] {
        const { displayMode, paletteSet, palette } = this.settings;
        return displayMode.getColors(paletteSet, palette, this.editorSettings.kangarooMode);
    }

    public clearAll(): void {
        this.ctx.clearRect(0, 0, this.$el.width, this.$el.height);
    }

    public get palette(): ColorPalette {
        return this.settings.palette;
    }

    public get paletteSet(): ColorPaletteSet {
        return this.settings.paletteSet;
    }

    public get displayMode(): DisplayMode {
        return this.settings.displayMode;
    }

    /**
     * Gets the first available non-transparent and non-background color
     */
    public get defaultColor(): DisplayModeColorIndex {
        const colors = this.getColors();
        for (let i = 0; i < colors.length; i++) {
            const colorValue = colors[i];
            if (!colorValue) {
                continue;
            }

            if (colorValue.colors.some(color => color.value !== 'transparent' && color.value !== 'background')) {
                return i;
            }
        }

        return 0;
    }

    protected convertAbsoluteToPixelCoordinate(location: Coordinate): Coordinate {
        const pixelX = Math.floor((location.x / this.editorSettings.zoomLevel) / this.pixelWidth);
        const pixelY = Math.floor((location.y / this.editorSettings.zoomLevel) / this.pixelHeight);

        return { x: pixelX, y: pixelY };
    }

    protected convertPixelToCanvasCoordinate(location: Coordinate): Coordinate {
        const absoluteX = location.x * this.internalPixelWidth;
        const absoluteY = location.y * this.internalPixelHeight;

        return { x: absoluteX, y: absoluteY };
    }

    // TODO should be protected
    public drawHoverStyleRect(
        x: number,
        y: number,
        width: number,
        height: number,
        lineWidthDivisor = 25,
    ): void {
        const ctx = this.ctx;
        const dashSize = Math.max(2, Math.round(this.displayPixelWidth / 15));
        ctx.strokeStyle = 'rgba(80, 80, 164, 0.75)';
        ctx.setLineDash([ dashSize, dashSize ]);
        ctx.lineWidth = Math.max(1, Math.round(this.displayPixelWidth / lineWidthDivisor));
        ctx.fillStyle = 'rgba(164, 164, 255, 0.35)';
        ctx.strokeRect(x, y, width, height);
        ctx.fillRect(x, y, width, height);
    }

    public syncInternalDimensions(): void {
        this.$el.width = this.internalWidth;
        this.$el.height = this.internalHeight;
    }
}
