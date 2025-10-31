import { EventEmitter } from './EventEmitter.ts';
import { Logger } from './Logger';
import { ObjectGroup } from './ObjectGroup.ts';
import type { Coordinate, Dimensions, PixelInfo } from './utils.ts';

export interface CanvasOptions extends Dimensions {
    pixelWidth: number;
    pixelHeight: number;
    editable?: boolean;
    mountEl: HTMLElement;
    pixelData?: PixelInfo[][];
    zoomLevel?: number;
    showGrid?: boolean;
    group: ObjectGroup;
}

export type PixelCanvasDrawState = 'idle' | 'drawing';

export type PixelDrawingBehavior = 'user' | 'internal';

export interface PixelDrawingEvent {
    pixel: PixelInfo;
    row: number;
    col: number;
    behavior: PixelDrawingBehavior;
}

type PixelCanvasEventMap = {
    pixel_highlight: [ PixelDrawingEvent ];
    pixel_draw: [ PixelDrawingEvent ];
};

export class PixelCanvas extends EventEmitter<PixelCanvasEventMap> {
    private width: number;
    private height: number;
    private displayWidth: number;
    private displayHeight: number;
    private pixelWidth: number;
    private pixelHeight: number;
    private zoomLevel: number;
    private isEditable = false;
    private ctx: CanvasRenderingContext2D;
    private logger: Logger;
    private readonly eventMap: Record<string, Array<(...x: any[]) => void>> = {};
    private readonly pixelData: PixelInfo[][];
    private showGrid;
    private readonly $container: HTMLElement;
    private readonly $frameContainer: HTMLDivElement;
    public readonly name: string;
    public readonly id: number;
    public readonly group: ObjectGroup;
    private destroyed = false;

    private static instanceCount = 0;

    private readonly $el: HTMLCanvasElement;
    private readonly $gridEl: HTMLCanvasElement;
    private readonly $hoverEl: HTMLCanvasElement;

    private drawState: PixelCanvasDrawState = 'idle';

    public constructor(options: CanvasOptions) {
        super();
        PixelCanvas.instanceCount++;
        this.id = PixelCanvas.instanceCount;
        this.name = `Object ${this.id}`;
        this.logger = Logger.from(this);
        this.group = options.group;

        this.$container = options.mountEl;

        this.$frameContainer = document.createElement('div');
        this.$frameContainer.classList.add('frame-container');

        this.$el = document.createElement('canvas');
        this.$el.classList.add('editor');
        this.$frameContainer.appendChild(this.$el);

        const context = this.$el.getContext('2d');
        if (!context) {
            throw new Error('Unable to retrieve 2d context for canvas element');
        }

        this.ctx = context;

        this.pixelData = options.pixelData || [];
        this.pixelWidth = options.pixelWidth;
        this.pixelHeight = options.pixelHeight;
        this.zoomLevel = options.zoomLevel || 1;
        this.showGrid = typeof options.showGrid === 'boolean' ? options.showGrid : false;

        this.width = options.width;
        this.height = options.height;

        this.displayWidth = this.width * this.displayPixelWidth;
        this.displayHeight = this.height * this.displayPixelHeight;
        this.logger.info(`setting display to ${this.displayWidth}x${this.displayHeight}`);

        this.$gridEl = document.createElement('canvas');
        this.$gridEl.classList.add('editor-grid');

        this.$hoverEl = document.createElement('canvas');
        this.$hoverEl.classList.add('editor-hover');

        this.setCanvasDimensions();

        this.render();

        if (options.editable) {
            this.enable();
        } else {
            this.disable();
        }
    }

    public getPixelDimensions(): Dimensions {
        return {
            width: this.pixelWidth,
            height: this.pixelHeight,
        };
    }

    public getDimensions(): Dimensions {
        return {
            width: this.width,
            height: this.height,
        };
    }

    public getContainer(): HTMLElement {
        return this.$container;
    }

    public clonePixelData(): PixelInfo[][] {
        return this.pixelData.map((row) => {
            return row.map((info) => {
                if (info.palette) {
                    return {
                        palette: info.palette,
                        index: info.index,
                    }
                }

                return {
                    palette: null,
                    index: null,
                };
            });
        });
    }

    public getZoomLevel(): number {
        return this.zoomLevel;
    }

    public getShowGrid(): boolean {
        return this.showGrid;
    }

    private setCanvasDimensions(): void {
        if (this.destroyed) {
            return;
        }

        this.displayWidth = this.width * this.displayPixelWidth;
        this.displayHeight = this.height * this.displayPixelHeight;

        this.$el.width = this.$gridEl.width = this.$hoverEl.width = this.displayWidth;
        this.$el.height = this.$gridEl.height = this.$hoverEl.height = this.displayHeight;

        this.setCanvasPosition();
        this.fillPixelDataArray();
    }

    public setCanvasPosition(): void {
        if (this.destroyed) {
            return;
        }

        const computedStyle = window.getComputedStyle(this.$el);
        const borderTopWidth = parseInt(computedStyle?.getPropertyValue('border-top-width'), 10);
        const borderLeftWidth = parseInt(computedStyle?.getPropertyValue('border-left-width'), 10);

        this.$gridEl.style.top = this.$hoverEl.style.top = (this.$el.offsetTop + borderTopWidth) + 'px';
        this.$gridEl.style.left = this.$hoverEl.style.left = (this.$el.offsetLeft + borderLeftWidth) + 'px';
    }

    private fillPixelDataArray(): void {
        for (let row = 0; row < this.height; row++) {
            const pixelRow = this.pixelData[row] = this.pixelData[row] || [];
            for (let col = 0; col < this.width; col++) {
                pixelRow[col] = pixelRow[col] || {
                    palette: null,
                    index: null,
                };
            }
        }
    }

    public hide(): void {
        if (this.destroyed) {
            return;
        }

        this.disable();

        this.$el.style.display = 'none';
        this.$hoverEl.style.display = 'none';
        this.$gridEl.style.display = 'none';
    }

    public show(): void {
        if (this.destroyed) {
            return;
        }

        if (!this.$frameContainer.isConnected) {
            this.$container.appendChild(this.$frameContainer);
        }
        if (!this.$gridEl.isConnected) {
            this.$el.insertAdjacentElement('afterend', this.$gridEl);
        }
        if (!this.$hoverEl.isConnected) {
            this.$el.insertAdjacentElement('afterend', this.$hoverEl);
        }

        this.$el.style.display = '';
        this.$hoverEl.style.display = '';
        this.$gridEl.style.display = '';
        this.setCanvasPosition();

        this.render();
        this.enable();
    }

    public destroy(): void {
        if (this.destroyed) {
            return;
        }

        this.disable();
        this.$el.remove();
        this.$hoverEl.remove();
        this.$gridEl.remove();
        this.destroyed = true;
    }

    public disable(): void {
        if (this.destroyed) {
            return;
        }

        // TODO
        // remove event listeners
        // for (const [ eventName, listeners ] of Object.entries(this.eventMap)) {
        //
        // }

        if (!this.isEditable) {
            return;
        }

        this.isEditable = false;
    }

    public enable(): void {
        if (this.destroyed) {
            return;
        }

        if (this.isEditable) {
            return;
        }

        const activatePixelAtCursor = (e: MouseEvent): void => {
            const { clientX, clientY } = e;

            const { top: offsetTop, left: offsetLeft } = this.$el.getBoundingClientRect();

            const trueX = clientX + document.documentElement.scrollLeft - offsetLeft;
            const trueY = clientY + document.documentElement.scrollTop - offsetTop;

            const pixelData = this.getPixelAt({ x: trueX, y: trueY });
            if (!pixelData.pixel) {
                // this.logger.warn(`no pixel found at ${trueX},${trueY}`);
            } else {
                const color = this.group.getActiveColor();
                pixelData.pixel.palette = this.group.getActivePalette();
                pixelData.pixel.index = this.group.getActiveColorIndex();
                this.drawPixelFromRowAndCol({ x: pixelData.col, y: pixelData.row }, pixelData.pixel, 'user');
            }
        };

        const onMouseMove = (e: MouseEvent): void => {
            activatePixelAtCursor(e);
        };

        const onMouseDown = (e: MouseEvent) => {
            if (!this.isEditable) {
                return;
            }

            if (this.drawState !== 'idle') {
                return;
            }

            if (e.shiftKey) {
                return;
            }

            this.setDrawState('drawing');
            this.unhighlightPixel();

            activatePixelAtCursor(e);
            this.$el.addEventListener('mousemove', onMouseMove);
        };

        const onMouseUp = () => {
            this.$el.removeEventListener('mousemove', onMouseMove);
            if (this.drawState !== 'idle') {
                this.setDrawState('idle');
            }
        };

        const onHover = (e: MouseEvent): void => {
            if (this.drawState !== 'idle') {
                return;
            }

            this.unhighlightPixel();

            if (e.shiftKey) {
                return;
            }

            const { clientX, clientY } = e;

            const { top: offsetTop, left: offsetLeft } = this.$el.getBoundingClientRect();

            const trueX = clientX + document.documentElement.scrollLeft - offsetLeft;
            const trueY = clientY + document.documentElement.scrollTop - offsetTop;

            const pixelData = this.getPixelAt({ x: trueX, y: trueY });
            if (!pixelData.pixel) {
                this.logger.warn(`no pixel found at ${trueX},${trueY}`);
            } else {
                this.highlightPixel({ x: pixelData.col, y: pixelData.row });
            }
        };

        const onMouseOut = () => {
            this.unhighlightPixel();
        };

        this.eventMap['mousedown'] = [ onMouseDown ];
        this.eventMap['mousemove'] = [ onMouseMove ];
        this.eventMap['mouseup'] = [ onMouseUp ];

        this.$el.addEventListener('mousedown', onMouseDown);
        this.$el.addEventListener('mousemove', onHover);
        this.$el.addEventListener('mouseout', onMouseOut);
        this.$el.ownerDocument.addEventListener('mouseup', onMouseUp);

        this.isEditable = true;
    }

    private setDrawState(newState: PixelCanvasDrawState): void {
        this.logger.info(`setting drawState to ${newState}`);
        this.drawState = newState;
    }

    public clear(): void {
        this.logger.info(`clearing canvas with color ${this.group.getBackgroundColor().hex}`);
        this.clearRect(0, 0, this.displayWidth, this.displayHeight);
    }

    public clearRect(x: number, y: number, width: number, height: number): void {
        if (this.destroyed) {
            return;
        }

        this.ctx.fillStyle = this.group.getBackgroundColor().hex;
        this.ctx.fillRect(x, y, width, height);
    }

    public render(): void {
        if (this.destroyed) {
            return;
        }

        this.clear();

        for (let row = 0; row < this.pixelData.length; row++) {
            const pixelRow = this.pixelData[row]!;
            for (let col = 0; col < pixelRow.length; col++) {
                const pixelInfo = pixelRow[col]!;
                this.drawPixelFromRowAndCol({ x: col, y: row }, pixelInfo, 'internal');
            }
        }

        this.renderGrid();
    }

    public renderGrid(): void {
        if (this.destroyed) {
            return;
        }

        const ctx = this.$gridEl.getContext('2d');
        if (!ctx) {
            this.logger.error('no grid canvas context');
            return;
        }

        const width = this.displayWidth;
        const height = this.displayHeight;
        ctx.clearRect(0, 0, width, height);
        if (!this.showGrid) {
            return;
        }

        ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i <= width; i += this.displayPixelWidth) {
            ctx.moveTo(i, 0);
            ctx.lineTo(i, height);
        }

        for (let i = 0; i <= height; i += this.displayPixelHeight) {
            ctx.moveTo(0, i);
            ctx.lineTo(width, i);
        }

        ctx.stroke();
    }

    /**
     * Probably should never be used publicly
     */
    public drawPixelFromScreenLocation(location: Coordinate, pixel: PixelInfo): boolean {
        if (this.destroyed) {
            return false;
        }

        if (!pixel.palette) {
            this.clearRect(location.x, location.y, this.displayPixelWidth, this.displayPixelHeight);
            return false;
        }

        this.ctx.fillStyle = pixel.palette.getColorAt(pixel.index).hex;
        this.ctx.fillRect(location.x, location.y, this.displayPixelWidth, this.displayPixelHeight);

        return true;
    }

    public drawPixelFromRowAndCol(pixelRowAndCol: Coordinate, pixel: PixelInfo, behavior: PixelDrawingBehavior): boolean {
        const { x: col, y: row } = pixelRowAndCol;
        // this.logger.debug(`drawing ${color} pixel at ${pixelRowAndCol.x},${pixelRowAndCol.y} [${row},${col}]`);
        const absoluteCoordinate = this.convertPixelToAbsoluteCoordinate(pixelRowAndCol);
        if (this.drawPixelFromScreenLocation(absoluteCoordinate, pixel)) {
            // pixel.color = color;
            this.emit('pixel_draw', { pixel, row, col, behavior });
            return true;
        }

        return false;
    }

    public highlightPixel(pixelRowAndCol: Coordinate): boolean {
        if (this.destroyed) {
            return false;
        }

        const { x: col, y: row } = pixelRowAndCol;
        const pixel = this.pixelData[row]?.[col] || null;
        if (!pixel) {
            return false;
        }

        const ctx = this.$hoverEl.getContext('2d');
        if (!ctx) {
            return false;
        }

        const absoluteCoordinate = this.convertPixelToAbsoluteCoordinate(pixelRowAndCol);

        // this.logger.debug(`highlighting pixel at ${absoluteCoordinate.x},${absoluteCoordinate.y}`);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.setLineDash([ 2, 2 ]);
        ctx.strokeRect(absoluteCoordinate.x, absoluteCoordinate.y, this.displayPixelWidth, this.displayPixelHeight);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        ctx.fillRect(absoluteCoordinate.x, absoluteCoordinate.y, this.displayPixelWidth, this.displayPixelHeight);

        this.emit('pixel_highlight', { pixel, row, col, behavior: 'user' });

        return true;
    }

    private get displayPixelWidth(): number {
        return this.pixelWidth * this.zoomLevel;
    }

    private get displayPixelHeight(): number {
        return this.pixelHeight * this.zoomLevel;
    }

    public unhighlightPixel(): boolean {
        if (this.destroyed) {
            return false;
        }

        const ctx = this.$hoverEl.getContext('2d');
        if (!ctx) {
            return false;
        }

        ctx.clearRect(0, 0, this.displayWidth, this.displayHeight);
        return true;
    }

    private convertAbsoluteToPixelCoordinate(location: Coordinate): Coordinate {
        const pixelX = Math.floor((location.x / this.zoomLevel) / this.pixelWidth);
        const pixelY = Math.floor((location.y / this.zoomLevel) / this.pixelHeight);

        return { x: pixelX, y: pixelY };
    }

    private convertPixelToAbsoluteCoordinate(location: Coordinate): Coordinate {
        const absoluteX = location.x * this.displayPixelWidth;
        const absoluteY = location.y * this.displayPixelHeight;

        return { x: absoluteX, y: absoluteY };
    }

    private getPixelAt(screenLocation: Coordinate): { row: number; col: number; pixel: PixelInfo | null } {
        const { x: col, y: row } = this.convertAbsoluteToPixelCoordinate(screenLocation);

        const pixel = this.pixelData[row]?.[col] || null;
        return {
            row,
            col,
            pixel,
        };
    }

    public setShowGrid(showGrid: boolean): void {
        this.showGrid = showGrid;
        this.renderGrid();
    }

    public setZoomLevel(zoomLevel: number): void {
        if (zoomLevel <= 0 || zoomLevel > 10) {
            return;
        }

        this.zoomLevel = zoomLevel;
        this.setCanvasDimensions();
        this.render();
    }

    public setDimensions(width: number | null, height: number | null): void {
        if (width !== null) {
            this.width = width;
        }
        if (height !== null) {
            this.height = height;
        }
        this.setCanvasDimensions();
        this.render();
    }

    public setPixelDimensions(width: number | null, height: number | null): void {
        if (width !== null) {
            this.pixelWidth = width;
        }
        if (height !== null) {
            this.pixelHeight = height;
        }
        this.setCanvasDimensions();
        this.render();
    }
}
