import { Logger } from './Logger';
import type { Coordinate, Dimensions, PixelColor, PixelInfo } from './utils.ts';

export interface CanvasOptions extends Dimensions {
    pixelWidth: number;
    pixelHeight: number;
    editable?: boolean;
    canvasEl: HTMLCanvasElement;
    pixelData?: PixelInfo[][];
    zoomLevel?: number;
    showGrid?: boolean;
}

export type PixelCanvasDrawState = 'idle' | 'drawing';

export class PixelCanvas {
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

    private $el: HTMLCanvasElement;
    private readonly $gridEl: HTMLCanvasElement;
    private readonly $hoverEl: HTMLCanvasElement;

    private drawState: PixelCanvasDrawState = 'idle';

    public constructor(options: CanvasOptions) {
        this.logger = Logger.from(this);


        this.$el = options.canvasEl;
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
        this.$el.insertAdjacentElement('afterend', this.$gridEl);

        this.$hoverEl = document.createElement('canvas');
        this.$hoverEl.classList.add('editor-hover');
        this.$el.insertAdjacentElement('afterend', this.$hoverEl);

        this.setCanvasDimensions();

        this.render();

        if (options.editable) {
            this.enable();
        } else {
            this.disable();
        }
    }

    private setCanvasDimensions(): void {
        this.displayWidth = this.width * this.displayPixelWidth;
        this.displayHeight = this.height * this.displayPixelHeight;

        this.$el.width = this.$gridEl.width = this.$hoverEl.width = this.displayWidth;
        this.$el.height = this.$gridEl.height = this.$hoverEl.height = this.displayHeight;

        this.setCanvasPosition();

        this.fillPixelDataArray();
    }

    private setCanvasPosition(): void {
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
                pixelRow[col] = pixelRow[col] || { color: null };
            }
        }
    }

    public disable(): void {
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
        if (this.isEditable) {
            return;
        }

        const activatePixelAtCursor = (e: MouseEvent): void => {
            const { clientX, clientY } = e;

            const offsetY = this.$el.offsetTop;
            const offsetX = this.$el.offsetLeft;

            const trueX = clientX + document.documentElement.scrollLeft - offsetX;
            const trueY = clientY + document.documentElement.scrollTop - offsetY;

            const pixelData = this.getPixelAt({ x: trueX, y: trueY });
            if (!pixelData.pixel) {
                this.logger.warn(`no pixel found at ${trueX},${trueY}`);
            } else {
                this.drawPixelFromRowAndCol({ x: pixelData.col, y: pixelData.row }, 'green');
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

            const { clientX, clientY } = e;

            const offsetY = this.$el.offsetTop;
            const offsetX = this.$el.offsetLeft;

            const trueX = clientX + document.documentElement.scrollLeft - offsetX;
            const trueY = clientY + document.documentElement.scrollTop - offsetY;

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

        // ensure that the absolutely positioned canvases are correctly aligned after a window resize
        window.addEventListener('resize', (() => {
            let timerId: number | null = null;
            return () => {
                if (timerId) {
                    window.clearTimeout(timerId);
                    timerId = null;
                }

                timerId = window.setTimeout(() => {
                    this.setCanvasPosition();
                }, 150);
            };
        })());

        this.isEditable = true;
    }

    private setDrawState(newState: PixelCanvasDrawState): void {
        this.logger.info(`setting drawState to ${newState}`);
        this.drawState = newState;
    }

    public clear(): void {
        this.ctx.clearRect(0, 0, this.displayWidth, this.displayHeight);
    }

    public render(): void {
        this.clear();

        for (let row = 0; row < this.pixelData.length; row++) {
            const pixelRow = this.pixelData[row]!;
            for (let col = 0; col < pixelRow.length; col++) {
                const pixelInfo = pixelRow[col]!;
                this.drawPixelFromRowAndCol({ x: col, y: row }, pixelInfo.color);
            }
        }

        this.renderGrid();
    }

    public renderGrid(): void {
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
    public drawPixelFromScreenLocation(location: Coordinate, color: PixelColor): boolean {
        if (!this.isEditable) {
            return false;
        }

        if (color === null) {
            this.ctx.clearRect(location.x, location.y, this.displayPixelWidth, this.displayPixelHeight);
            return false;
        }

        // this.logger.debug(`drawing ${color} pixel absolutely at ${location.x},${location.y}`);
        this.ctx.fillStyle = color;
        this.ctx.fillRect(location.x, location.y, this.displayPixelWidth, this.displayPixelHeight);

        return true;
    }

    public drawPixelFromRowAndCol(pixelRowAndCol: Coordinate, color: PixelColor): boolean {
        if (!this.isEditable) {
            return false;
        }

        const { x: col, y: row } = pixelRowAndCol;
        const pixel = this.pixelData[row]?.[col] || null;
        if (!pixel) {
            this.logger.error(`No pixel data at coordinate ${pixelRowAndCol.x},${pixelRowAndCol.y}`);
            return false;
        }
        // this.logger.debug(`drawing ${color} pixel at ${pixelRowAndCol.x},${pixelRowAndCol.y} [${row},${col}]`);
        const absoluteCoordinate = this.convertPixelToAbsoluteCoordinate(pixelRowAndCol);
        if (this.drawPixelFromScreenLocation(absoluteCoordinate, color)) {
            pixel.color = color;
            return true;
        }

        this.logger.warn(`failed to draw pixel`);
        return false;
    }

    public highlightPixel(pixelRowAndCol: Coordinate): boolean {
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

        return true;
    }

    private get displayPixelWidth(): number {
        return this.pixelWidth * this.zoomLevel;
    }

    private get displayPixelHeight(): number {
        return this.pixelHeight * this.zoomLevel;
    }

    public unhighlightPixel(): boolean {
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
        if (zoomLevel < 1 || zoomLevel > 4 || !Number.isInteger(zoomLevel)) {
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
