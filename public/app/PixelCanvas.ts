import type { ColorPalette } from './ColorPalette.ts';
import type { ColorPaletteSet } from './ColorPaletteSet.ts';
import DisplayMode from './DisplayMode.ts';
import type { EditorSettings } from './Editor.ts';
import { EventEmitter } from './EventEmitter.ts';
import { Logger } from './Logger';
import { ObjectGroup, type ObjectGroupSerialized } from './ObjectGroup.ts';
import {
    type AssemblyNumberFormatRadix,
    type Coordinate,
    type Dimensions,
    type DisplayModeColorIndex,
    type DisplayModeColorValue,
    type DisplayModeColorValueSerialized,
    type DisplayModeName,
    formatAssemblyNumber,
    isLeftMouseButton,
    isPaletteIndex,
    nope,
    type PixelInfo,
    type PixelInfoSerialized
} from './utils.ts';

export interface CanvasOptions extends Dimensions {
    id?: PixelCanvas['id'];
    name?: PixelCanvas['name'];
    pixelWidth: number;
    pixelHeight: number;
    mountEl: HTMLElement;
    pixelData?: PixelInfo[][];
    group: ObjectGroup;
    editorSettings: EditorSettings;
    displayMode: DisplayMode | DisplayModeName;
    palette: ColorPalette;
    activeColor?: DisplayModeColorIndex;
}

interface DrawPixelOptions {
    behavior: PixelDrawingBehavior;
    erasing?: boolean; // erase the pixel instead of coloring it, defaults to false
    emit?: boolean; // emit pixel_draw, defaults to true
    ctx?: CanvasRenderingContext2D;
    immutable?: boolean; // do not update the pixel's color, defaults to false
}

export type GeneratedImageSize = 'thumbnail' | 'full';

export type PixelCanvasDrawState = 'idle' | 'drawing';

export type PixelDrawingBehavior =
    // the user initiated the draw action
    'user' |
    // internal system (e.g. rendering) initiated the draw action
    'internal';

interface LocatedPixel {
    row: number;
    col: number;
    pixel: PixelInfo | null;
}

export interface PixelDrawingEvent {
    pixel: PixelInfo;
    row: number;
    col: number;
    behavior: PixelDrawingBehavior;
}

export interface CodeGenerationOptionsBase {
    indentChar: string;
    labelColon: boolean;
    addressOffsetRadix: AssemblyNumberFormatRadix;
    byteRadix: AssemblyNumberFormatRadix;
    object: boolean;
    header: boolean;
}

export interface CodeGenerationOptionsLabel extends CodeGenerationOptionsBase {
    addressLabel: string;
}

export interface CodeGenerationOptionsOffset extends CodeGenerationOptionsBase {
    addressOffset: number;
}

export type CodeGenerationOptions = CodeGenerationOptionsLabel | CodeGenerationOptionsOffset;

const hasAddressLabel = (options: CodeGenerationOptions): options is CodeGenerationOptionsLabel => {
    return !!((options as CodeGenerationOptionsLabel).addressLabel || '').trim();
}

type PixelCanvasEventMap = {
    pixel_draw: [ PixelDrawingEvent ];
    pixel_draw_aggregate: [ Pick<PixelDrawingEvent, 'behavior'> ];
    pixel_hover: [ Coordinate, PixelInfo ];
    reset: [];
    draw_start: [];
    pixel_dimensions_change: [];
    canvas_dimensions_change: [];
    display_mode_change: [];
    palette_change: [];
    active_color_change: [ DisplayModeColorIndex ];
};

export interface PixelCanvasSerialized {
    id: PixelCanvas['id'];
    name: PixelCanvas['name'];
    pixelWidth: PixelCanvas['pixelWidth'];
    pixelHeight: PixelCanvas['pixelHeight'];
    width: PixelCanvas['width'];
    height: PixelCanvas['height'];
    group: ObjectGroupSerialized;
    pixelData: PixelInfoSerialized[][];
    displayModeName: DisplayModeName;
    paletteId: ColorPalette['id'];
    activeColor: DisplayModeColorValueSerialized;
}

export class PixelCanvas extends EventEmitter<PixelCanvasEventMap> {
    private width: number;
    private height: number;
    private displayWidth: number;
    private displayHeight: number;
    private pixelWidth: number;
    private pixelHeight: number;
    private readonly editorSettings: Readonly<EditorSettings>;
    private readonly ctx: CanvasRenderingContext2D;
    private readonly logger: Logger;
    private readonly eventMap: Array<[ EventTarget, string, (...args: any[]) => void ]> = [];
    private pixelData: PixelInfo[][];
    private readonly $container: HTMLElement;
    private readonly $frameContainer: HTMLDivElement;
    private name: string;
    public readonly id: number;
    public readonly group: ObjectGroup;
    private destroyed = false;
    private displayMode: DisplayMode;
    private palette: ColorPalette;
    private activeColor: DisplayModeColorIndex;

    private static instanceCount = 0;
    private static transparentPatternMap: Record<number, CanvasPattern> = {};

    private readonly $el: HTMLCanvasElement;
    private readonly $gridEl: HTMLCanvasElement;
    private readonly $hoverEl: HTMLCanvasElement;
    private readonly $bgEl: HTMLCanvasElement;
    private readonly $transientEl: HTMLCanvasElement;

    private drawState: PixelCanvasDrawState = 'idle';

    public static readonly transparentColor1 = 'rgba(208, 208, 208, 0.5)';
    public static readonly transparentColor2 = 'rgba(255, 255, 255, 0.5)';

    public constructor(options: CanvasOptions) {
        super();
        PixelCanvas.instanceCount++;
        this.id = options.id || PixelCanvas.instanceCount;
        this.name = options.name || `Object ${this.id}`;
        this.logger = Logger.from(this);
        this.group = options.group;
        this.editorSettings = options.editorSettings;
        this.displayMode = options.displayMode instanceof DisplayMode ?
            options.displayMode :
            DisplayMode.create(options.displayMode);
        this.palette = options.palette;
        this.activeColor = options.activeColor || 0;

        this.setActiveColor(this.activeColor);

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
        this.width = options.width;
        this.height = options.height;

        this.displayWidth = this.width * this.displayPixelWidth;
        this.displayHeight = this.height * this.displayPixelHeight;
        this.logger.info(`setting display to ${this.displayWidth}x${this.displayHeight}`);

        this.$gridEl = document.createElement('canvas');
        this.$gridEl.classList.add('editor-grid');

        this.$hoverEl = document.createElement('canvas');
        this.$hoverEl.classList.add('editor-hover');

        this.$bgEl = document.createElement('canvas');
        this.$bgEl.classList.add('editor-bg');

        this.$transientEl = document.createElement('canvas');
        this.$transientEl.classList.add('editor-transient');

        this.setCanvasDimensions();
        this.enable();
    }

    private getTransparentPattern(): CanvasPattern {
        const key = this.editorSettings.zoomLevel;
        let pattern = PixelCanvas.transparentPatternMap[key] || null;

        if (!pattern) {
            const $canvas = document.createElement('canvas');
            $canvas.width = Math.max(2, this.displayPixelWidth);
            $canvas.height = Math.max(2, this.displayPixelWidth); // use height instead?

            const ctx = $canvas.getContext('2d');
            if (!ctx) {
                throw new Error(`could not retrieve pattern context`);
            }

            ctx.fillStyle = PixelCanvas.transparentColor1;
            ctx.fillRect(0, 0, $canvas.width / 2, $canvas.height / 2);
            ctx.fillRect($canvas.width / 2, $canvas.height / 2, $canvas.width / 2, $canvas.height / 2);
            ctx.fillStyle = PixelCanvas.transparentColor2;
            ctx.fillRect($canvas.width / 2, 0, $canvas.width / 2, $canvas.height / 2);
            ctx.fillRect(0, $canvas.height / 2, $canvas.width / 2, $canvas.height / 2);

            pattern = this.ctx.createPattern($canvas, 'repeat');
            if (!pattern) {
                throw new Error(`could not create transparent pattern`);
            }

            PixelCanvas.transparentPatternMap[key] = pattern;
        }

        return pattern;
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

    public getHTMLRect(): Dimensions & Coordinate {
        const { width, height, x, y } = this.$el.getBoundingClientRect();
        return {
            x,
            y,
            width,
            height,
        };
    }

    public getContainer(): HTMLElement {
        return this.$container;
    }

    public getName(): string {
        return this.name;
    }

    public getActiveColor(): DisplayModeColorIndex {
        return this.activeColor;
    }

    public setActiveColor(modeColorIndex: DisplayModeColorIndex): void {
        this.activeColor = modeColorIndex;
        this.logger.debug(`active color set to`, modeColorIndex);
    }

    public clonePixelData(): PixelInfo[][] {
        return this.pixelData.map((row) => {
            return row.map((info) => {
                return {
                    modeColorIndex: info.modeColorIndex,
                };
            });
        });
    }

    private execOnCanvasElements(thunk: (canvasEl: HTMLCanvasElement) => void): void {
        [ this.$el, this.$gridEl, this.$hoverEl, this.$bgEl, this.$transientEl ].forEach(thunk);
    }

    private setCanvasDimensions(): void {
        if (this.destroyed) {
            return;
        }

        this.displayWidth = this.width * this.displayPixelWidth;
        this.displayHeight = this.height * this.displayPixelHeight;

        this.execOnCanvasElements((canvasEl) => {
            canvasEl.width = this.displayWidth;
            canvasEl.height = this.displayHeight;
        });

        this.fillPixelDataArray();
    }

    private fillPixelDataArray(reset = false): void {
        if (reset) {
            this.pixelData = [];
        }
        for (let row = 0; row < this.height; row++) {
            const pixelRow = this.pixelData[row] = this.pixelData[row] || [];
            for (let col = 0; col < this.width; col++) {
                const defaultValue: PixelInfo = {
                    modeColorIndex: null,
                };
                pixelRow[col] = reset ? defaultValue : pixelRow[col] || defaultValue;
            }
        }
    }

    public getDisplayMode(): DisplayMode {
        return this.displayMode;
    }

    public supportsKangarooMode(): boolean {
        return this.displayMode.supportsKangarooMode;
    }

    public canExportToASM(): boolean {
        return this.displayMode.canExportToASM;
    }

    public getColors(): DisplayModeColorValue[] {
        return this.displayMode.getColors(this.group.getPaletteSet(), this.palette, this.editorSettings.kangarooMode);
    }

    public setDisplayMode(newMode: DisplayMode | DisplayModeName): void {
        if (typeof newMode === 'string') {
            newMode = DisplayMode.create(newMode);
        }
        this.displayMode = newMode;
        this.setActiveColor(0);
        this.emit('display_mode_change');
    }

    public getColorPalette(): ColorPalette {
        return this.palette;
    }

    public setColorPalette(newPalette: ColorPalette): void {
        if (this.palette === newPalette) {
            return;
        }

        this.logger.debug(`setting color palette to ${this.palette.name} {${this.palette.id}}`);

        this.palette = newPalette;
        this.render();
        this.emit('palette_change');
    }

    public hide(): void {
        if (this.destroyed) {
            return;
        }

        this.logger.debug('hiding');
        this.disable();

        // TODO this is unnecessary, we can just show/hide the .frame-container parent element instead of
        // all <canvas> elements
        this.execOnCanvasElements(canvasEl => canvasEl.style.display = 'none');
    }

    public show(): void {
        if (this.destroyed) {
            return;
        }

        this.logger.debug('showing');

        if (!this.$frameContainer.isConnected) {
            this.$container.appendChild(this.$frameContainer);
        }
        if (!this.$gridEl.isConnected) {
            this.$el.insertAdjacentElement('afterend', this.$gridEl);
        }
        if (!this.$hoverEl.isConnected) {
            this.$el.insertAdjacentElement('afterend', this.$hoverEl);
        }
        if (!this.$bgEl.isConnected) {
            this.$el.insertAdjacentElement('afterend', this.$bgEl);
        }
        if (!this.$transientEl.isConnected) {
            this.$el.insertAdjacentElement('afterend', this.$transientEl);
        }

        this.execOnCanvasElements(canvasEl => canvasEl.style.display = '');

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
        this.$bgEl.remove();
        this.destroyed = true;
    }

    public disable(): void {
        if (this.destroyed) {
            return;
        }

        while (this.eventMap.length) {
            const item = this.eventMap.pop();
            if (!item) {
                break;
            }

            const [ target, eventName, listener ] = item;
            target.removeEventListener(eventName, listener);
        }
    }

    private selectColorAtPixel(pixel: PixelInfo | null): void {
        if (typeof pixel?.modeColorIndex === 'number' && pixel.modeColorIndex !== this.activeColor) {
            this.setActiveColor(pixel.modeColorIndex);
            this.emit('active_color_change', pixel.modeColorIndex);
        }
    }

    public enable(): void {
        if (this.destroyed) {
            return;
        }

        interface TransientPixelData {
            coordinate: Coordinate;
            pixel: PixelInfo;
            color: DisplayModeColorIndex | null;
        }

        let mouseDownOrigin: LocatedPixel | null = null;
        let lastDrawnPixel: PixelInfo | null = null;
        let transientState: TransientPixelData[] = [];

        const transientCtx = this.$transientEl.getContext('2d');
        if (!transientCtx) {
            throw new Error(`Unable to create 2d context for transient canvas`);
        }

        const activatePixelAtCursor = (e: MouseEvent): void => {
            const { clientX, clientY, ctrlKey: erasing } = e;
            const { top: offsetTop, left: offsetLeft } = this.$el.getBoundingClientRect();
            const trueX = clientX + document.documentElement.scrollLeft - offsetLeft;
            const trueY = clientY + document.documentElement.scrollTop - offsetTop;

            const pixelData = this.getPixelAt({ x: trueX, y: trueY });
            if (!pixelData.pixel) {
                return;
            }

            // prevent doing too much work on mousemove: if we're hovering over the same pixel we
            // don't need to process it again
            if (lastDrawnPixel === pixelData.pixel) {
                return;
            }

            const pixelCoordinate = {
                x: pixelData.col,
                y: pixelData.row,
            };

            switch (this.editorSettings.drawMode) {
                case 'fill': {
                    let drawn = false;
                    const seen: Record<string, 1> = {};
                    const prevColor = pixelData.pixel.modeColorIndex;

                    const fill = (coordinate: Coordinate, pixel: PixelInfo) => {
                        drawn = this.drawPixelFromRowAndCol(coordinate, pixel, {
                            behavior: 'user',
                            erasing,
                            emit: false,
                        }) || drawn;

                        const { x: col, y: row } = coordinate;

                        // recursively set all adjacent pixels with same color to the new color
                        const pixels: Coordinate[] = [
                            { x: col, y: row - 1 },
                            { x: col, y: row + 1 },
                            { x: col - 1, y: row },
                            { x: col + 1, y: row },
                        ];

                        seen[`${col},${row}`] = 1;
                        pixels.forEach((coordinate) => {
                            const pixel = this.pixelData[coordinate.y]?.[coordinate.x];
                            if (!pixel) {
                                return;
                            }

                            if (seen[`${coordinate.x},${coordinate.y}`]) {
                                // prevent infinite recursion
                                return;
                            }

                            if (pixel.modeColorIndex === prevColor) {
                                fill(coordinate, pixel);
                            }
                        });
                    };

                    fill(pixelCoordinate, pixelData.pixel);

                    if (drawn) {
                        this.emit('pixel_draw_aggregate', { behavior: 'user' });
                    }

                    break;
                }

                case 'erase':
                    this.drawPixelFromRowAndCol(pixelCoordinate, pixelData.pixel, { behavior: 'user', erasing: true });
                    break;

                case 'dropper':
                    this.selectColorAtPixel(pixelData.pixel);
                    break;

                case 'ellipse':
                case 'ellipse-filled':
                case 'rect':
                case 'rect-filled': {
                    if (!mouseDownOrigin) {
                        // this will be one of the corners of the rectangle, depending on
                        // which direction the user is dragging
                        mouseDownOrigin = pixelData;
                    }

                    const width = Math.abs(mouseDownOrigin.col - pixelData.col);
                    const height = Math.abs(mouseDownOrigin.row - pixelData.row);
                    const start: Coordinate = {
                        x: Math.min(mouseDownOrigin.col, pixelData.col),
                        y: Math.min(mouseDownOrigin.row, pixelData.row),
                    };

                    this.clearRect(0, 0, this.$transientEl.width, this.$transientEl.height, transientCtx);
                    transientState = [];
                    for (let row = start.y; row <= start.y + height; row++) {
                        for (let col = start.x; col <= start.x + width; col++) {
                            const pixel = this.pixelData[row]?.[col];
                            if (!pixel) {
                                continue;
                            }

                            if (this.editorSettings.drawMode === 'rect') {
                                // only color the outer edges
                                if (
                                    row !== start.y &&
                                    row !== start.y + height &&
                                    col !== start.x &&
                                    col !== start.x + width
                                ) {
                                    continue;
                                }
                            } else if (
                                this.editorSettings.drawMode === 'ellipse-filled' ||
                                this.editorSettings.drawMode === 'ellipse'
                            ) {
                                const w = Math.floor(width / 2);
                                const h = Math.floor(height / 2);
                                const x = col - start.x - w;
                                const y = row - start.y - h;

                                const value = ((x * x) / (w * w)) + ((y * y) / (h * h));

                                if (this.editorSettings.drawMode === 'ellipse-filled') {
                                    if (value >= 1) {
                                        continue;
                                    }
                                } else {
                                    // normally if value === 1 then the point would lie on the edge, but since
                                    // we're dealing with blocky pixels you get a quite sparse ellipse if you
                                    // do that. by rounding we can kinda get a "closed" ellipse, although it
                                    // gets quite thick at larger sizes.
                                    if (Math.round(value * 3) !== 3) {
                                        continue;
                                    }
                                }
                            }

                            // TODO erasing?
                            const drawn = this.drawPixelFromRowAndCol({ x: col, y: row }, pixel, {
                                behavior: 'user',
                                emit: false,
                                ctx: transientCtx,
                                immutable: true,
                            });

                            if (drawn) {
                                transientState.push({
                                    color: this.activeColor, // TODO this isn't used...
                                    coordinate: {
                                        x: col,
                                        y: row,
                                    },
                                    pixel,
                                });
                            }
                        }
                    }

                    break;
                }

                case 'line':
                    throw new Error(`drawMode "${this.editorSettings.drawMode}" is not supported yet`);

                case 'draw':
                    this.drawPixelFromRowAndCol(pixelCoordinate, pixelData.pixel, { behavior: 'user', erasing });
                    break;

                default:
                    nope(this.editorSettings.drawMode);
                    throw new Error(`Unknow drawMode "${this.editorSettings.drawMode}"`);
            }

            lastDrawnPixel = pixelData.pixel;
            this.emit('pixel_hover', pixelCoordinate, pixelData.pixel);
        };

        const getPixelFromMouseEvent = (e: MouseEvent): LocatedPixel => {
            const { clientX, clientY } = e;
            const { top: offsetTop, left: offsetLeft } = this.$el.getBoundingClientRect();
            const trueX = clientX + document.documentElement.scrollLeft - offsetLeft;
            const trueY = clientY + document.documentElement.scrollTop - offsetTop;

            return this.getPixelAt({ x: trueX, y: trueY });
        }

        const cleanUpTransientState = (): void => {
            mouseDownOrigin = null;
            lastDrawnPixel = null;

            let drawn = false;
            while (transientState.length) {
                const data = transientState.pop()!;
                drawn = this.drawPixelFromRowAndCol(data.coordinate, data.pixel, {
                    behavior: 'user',
                    emit: false,
                }) || drawn;
            }

            if (drawn) {
                this.emit('pixel_draw_aggregate', { behavior: 'user' });
            }

            this.clearRect(0, 0, this.$transientEl.width, this.$transientEl.height, transientCtx);
        };

        const onMouseMove = (e: MouseEvent): void => {
            activatePixelAtCursor(e);
        };

        const onMouseDown = (e: MouseEvent) => {
            if (this.drawState !== 'idle' || e.shiftKey) {
                return;
            }

            if (e.altKey || e.button === 1) {
                // Alt+click or middle button
                const pixelData = getPixelFromMouseEvent(e);
                this.selectColorAtPixel(pixelData.pixel);
                return;
            }

            if (!isLeftMouseButton(e)) {
                return;
            }

            this.setDrawState('drawing');
            this.emit('draw_start');
            this.unhighlightPixel();

            activatePixelAtCursor(e);
            this.addEvent(this.$el, 'mousemove', onMouseMove);
        };

        const onMouseUp = () => {
            this.$el.removeEventListener('mousemove', onMouseMove);
            if (this.drawState !== 'idle') {
                this.setDrawState('idle');
            }

            cleanUpTransientState();
        };

        const onHover = (e: MouseEvent): void => {
            if (this.drawState !== 'idle') {
                return;
            }

            this.unhighlightPixel();

            if (e.shiftKey) {
                return;
            }

            const pixelData = getPixelFromMouseEvent(e);
            if (pixelData.pixel) {
                this.highlightPixel({ x: pixelData.col, y: pixelData.row });
            }
        };

        const onMouseOut = () => {
            this.unhighlightPixel();
        };

        this.addEvent(this.$el, 'mousedown', onMouseDown);
        this.addEvent(this.$el, 'mousemove', onHover);
        this.addEvent(this.$el, 'mouseout', onMouseOut);
        this.addEvent(this.$el.ownerDocument, 'mouseup', onMouseUp);
    }

    private addEvent(target: EventTarget, name: string, listener: (...args: any[]) => void): void {
        target.addEventListener(name, listener);
        this.eventMap.push([ target, name, listener ]);
    }

    private generateURLTimeoutId: number | null = null;

    public generateDataURL(callback: (url: string | null) => void, size: GeneratedImageSize = 'thumbnail'): void {
        if (this.generateURLTimeoutId) {
            window.clearTimeout(this.generateURLTimeoutId);
            this.generateURLTimeoutId = null;
        }

        this.generateURLTimeoutId = window.setTimeout(() => {
            const $canvas = document.createElement('canvas');

            $canvas.width = this.$el.width;
            $canvas.height = this.$el.height;

            let scaleFactor = 1;
            if (size === 'thumbnail') {
                const maxSize = 128;
                const maxLength = Math.max(this.$el.width, this.$el.height);
                scaleFactor = Math.min(1, maxSize / maxLength);
            }

            $canvas.width = Math.round(scaleFactor * this.$el.width);
            $canvas.height = Math.round(scaleFactor * this.$el.height);

            const ctx = $canvas.getContext('2d');
            if (!ctx) {
                callback(null);
                return;
            }

            this.logger.debug('generating image of canvas');
            const start = Date.now();
            ctx.drawImage(this.$bgEl, 0, 0, $canvas.width, $canvas.height);
            ctx.drawImage(this.$el, 0, 0, $canvas.width, $canvas.height);

            $canvas.toBlob((blob) => {
                if (!blob) {
                    callback(null);
                    return;
                }

                this.logger.debug(`image generated in ${Date.now() - start}ms`);
                callback(URL.createObjectURL(blob));
            }, 'image/png');
        }, 50);
    }

    private setDrawState(newState: PixelCanvasDrawState): void {
        this.logger.info(`setting drawState to ${newState}`);
        this.drawState = newState;
    }

    public clear(): void {
        this.logger.info(`clearing canvas`);
        this.clearRect(0, 0, this.displayWidth, this.displayHeight);
    }

    public reset(): void {
        this.clear();
        this.fillPixelDataArray(true);
        this.emit('reset');
    }

    public clearRect(x: number, y: number, width: number, height: number, ctx = this.ctx): void {
        if (this.destroyed) {
            return;
        }

        ctx.clearRect(x, y, width, height);
    }

    public render(): void {
        if (this.destroyed) {
            return;
        }

        const start = Date.now();
        this.logger.debug('rendering');
        this.clear();
        this.renderBg();

        let pixelsDrawn = 0;
        let totalPixels = 0;
        for (let row = 0; row < this.pixelData.length; row++) {
            const pixelRow = this.pixelData[row]!;
            for (let col = 0; col < pixelRow.length; col++) {
                totalPixels++;
                const pixelInfo = pixelRow[col]!;
                if (this.drawPixelFromRowAndCol({ x: col, y: row }, pixelInfo, { behavior: 'internal', emit: false })) {
                    pixelsDrawn += (pixelInfo.modeColorIndex !== null ? 1 : 0);
                }
            }
        }

        this.logger.debug(`drew ${pixelsDrawn}/${totalPixels} pixel${pixelsDrawn === 1 ? '' : 's'}`);

        this.renderGrid();
        this.logger.debug(`rendering complete in ${Date.now() - start}ms`);
        this.emit('pixel_draw_aggregate', { behavior: 'internal' });
    }

    public renderBg(): void {
        if (this.destroyed) {
            return;
        }

        const ctx = this.$bgEl.getContext('2d');
        if (!ctx) {
            this.logger.error('no bg canvas context');
            return;
        }

        this.logger.debug('rendering bg');

        // since the checkerboard pattern is transparent, we need to ensure the css bg is part
        // of the canvas so that converting the canvas to an image includes the bg.
        const bgColor = window.getComputedStyle(this.$bgEl)?.getPropertyValue('background-color');
        if (bgColor) {
            ctx.fillStyle = bgColor;
            ctx.fillRect(0, 0, this.$bgEl.width, this.$bgEl.height);
        } else {
            ctx.clearRect(0, 0, this.$bgEl.width, this.$bgEl.height);
        }

        ctx.fillStyle = this.editorSettings.uncoloredPixelBehavior === 'transparent' ?
            this.getTransparentPattern() :
            this.group.getBackgroundColor().hex;
        ctx.fillRect(0, 0, this.$bgEl.width, this.$bgEl.height);
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

        this.logger.debug('rendering grid');

        const width = this.displayWidth;
        const height = this.displayHeight;
        ctx.clearRect(0, 0, width, height);
        if (!this.editorSettings.showGrid) {
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

    private getColorForModeIndex(index: DisplayModeColorIndex): DisplayModeColorValue | null {
        if (index === null) {
            return null;
        }
        const paletteSet = this.editorSettings.activeColorPaletteSet;
        const kangarooMode = this.editorSettings.kangarooMode;
        return this.displayMode.getColorAt(paletteSet, this.palette, index, kangarooMode);
    }

    public drawPixelFromRowAndCol(pixelRowAndCol: Coordinate, pixel: PixelInfo, options: DrawPixelOptions): boolean {
        if (this.destroyed) {
            return false;
        }

        const ctx = options.ctx || this.ctx;
        const behavior = options.behavior;
        const immutable = options.immutable === true;

        const isUserAction = behavior === 'user';

        // if it's the user actually drawing something, we use the current palette/color, otherwise,
        // it's just an internal render, and we use the pixel's current palette/color
        const newColor = isUserAction ?
            (options.erasing ? null : this.activeColor) :
            pixel.modeColorIndex;


        // NOTE: all the "if (isUserAction)" stuff is for performance reasons, apparently
        // calling a function that does the same conditional is significantly slower than just
        // doing it inline. and since this is called in a loop during render() it gets called
        // a lot.
        // basically we only need to manually clear a pixel if it's initiated by the user
        // i.e. a drawing action, regular renders do a full clear of the canvas before
        // drawing so subsequent clearRect() calls aren't needed.

        const { x: col, y: row } = pixelRowAndCol;
        const absoluteCoordinate = this.convertPixelToAbsoluteCoordinate(pixelRowAndCol);

        if (newColor === null) {
            if (isUserAction) {
                this.clearRect(
                    absoluteCoordinate.x,
                    absoluteCoordinate.y,
                    this.displayPixelWidth,
                    this.displayPixelHeight,
                    ctx,
                );
            }
        } else {
            const colorValue = this.getColorForModeIndex(newColor);
            if (!colorValue) {
                this.logger.error(`color[${newColor}] not found in display mode ${this.displayMode.name}`);
                if (isUserAction) {
                    this.clearRect(
                        absoluteCoordinate.x,
                        absoluteCoordinate.y,
                        this.displayPixelWidth,
                        this.displayPixelHeight,
                        ctx,
                    );
                }
            } else {
                // not using slice() since it's probably more efficient to not copy the array since this is
                // called in a loop. but ain't nobody got time for benchmarking, so maybe it wouldn't even
                // matter...
                const partsPerPixel = Math.min(colorValue.colors.length, this.displayMode.partsPerPixel);
                for (let i = 0; i < partsPerPixel; i++) {
                    const color = colorValue.colors[i];
                    if (!color) {
                        break;
                    }

                    const width = this.displayPixelWidth / partsPerPixel;
                    const fudge = i * width;
                    const x = absoluteCoordinate.x + fudge;
                    if (color.value === 'background') {
                        ctx.fillStyle = this.group.getBackgroundColor().hex;
                        ctx.fillRect(x, absoluteCoordinate.y, width, this.displayPixelHeight);
                    } else if (color.value === 'transparent') {
                        if (isUserAction) {
                            this.clearRect(x, absoluteCoordinate.y, width, this.displayPixelHeight, ctx);
                        }
                    } else {
                        ctx.fillStyle = color.value.palette.getColorAt(color.value.index).hex;
                        ctx.fillRect(x, absoluteCoordinate.y, width, this.displayPixelHeight);
                    }
                }
            }
        }

        if (!immutable) {
            pixel.modeColorIndex = newColor;
        }

        if (isUserAction) {
            // important to not emit for internal drawing actions for performance reasons
            if (options.emit !== false) {
                this.emit('pixel_draw', { pixel, row, col, behavior });
            }
        }

        return true;
    }

    public static generateHash(data: PixelInfo[][]): string {
        return '\n' + data
            .map(row => row.map(data => data.modeColorIndex === null ? '' : data.modeColorIndex))
            .join('\n');
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

        const dashSize = Math.max(2, Math.round(this.displayPixelWidth / 15));
        ctx.strokeStyle = 'rgba(80, 80, 164, 0.75)';
        ctx.setLineDash([ dashSize, dashSize ]);
        ctx.lineWidth = Math.max(1, Math.round(this.displayPixelWidth / 25));
        ctx.strokeRect(absoluteCoordinate.x, absoluteCoordinate.y, this.displayPixelWidth, this.displayPixelHeight);
        ctx.fillStyle = 'rgba(164, 164, 255, 0.35)';
        ctx.fillRect(absoluteCoordinate.x, absoluteCoordinate.y, this.displayPixelWidth, this.displayPixelHeight);

        this.emit('pixel_hover', pixelRowAndCol, pixel);

        return true;
    }

    private get displayPixelWidth(): number {
        return this.pixelWidth * this.editorSettings.zoomLevel;
    }

    private get displayPixelHeight(): number {
        return this.pixelHeight * this.editorSettings.zoomLevel;
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
        const pixelX = Math.floor((location.x / this.editorSettings.zoomLevel) / this.pixelWidth);
        const pixelY = Math.floor((location.y / this.editorSettings.zoomLevel) / this.pixelHeight);

        return { x: pixelX, y: pixelY };
    }

    private convertPixelToAbsoluteCoordinate(location: Coordinate): Coordinate {
        const absoluteX = location.x * this.displayPixelWidth;
        const absoluteY = location.y * this.displayPixelHeight;

        return { x: absoluteX, y: absoluteY };
    }

    private getPixelAt(screenLocation: Coordinate): LocatedPixel {
        const { x: col, y: row } = this.convertAbsoluteToPixelCoordinate(screenLocation);

        const pixel = this.pixelData[row]?.[col] || null;
        return {
            row,
            col,
            pixel,
        };
    }

    public setShowGrid(): void {
        this.renderGrid();
    }

    public setZoomLevel(render = true): void {
        this.setCanvasDimensions();
        if (render) {
            this.render();
        }
    }

    public setUncoloredPixelBehavior(): void {
        this.renderBg();
    }

    public setDimensions(width: number | null, height: number | null): void {
        let changed = false;
        if (width !== null && this.width !== width) {
            this.width = width;
            changed = true;
        }
        if (height !== null && this.height !== height) {
            this.height = height;
            changed = true;
        }

        if (changed) {
            this.logger.debug(`updated dimensions to ${this.width}x${this.height}`);
            this.setCanvasDimensions();
            this.render();
            this.emit('canvas_dimensions_change');
        }
    }

    public setPixelDimensions(width: number | null, height: number | null): void {
        if (this.destroyed) {
            return;
        }

        let changed = false;
        if (width !== null && this.pixelWidth !== width) {
            this.pixelWidth = width;
            changed = true;
        }
        if (height !== null && this.pixelHeight !== height) {
            this.pixelHeight = height;
            changed = true;
        }

        if (changed) {
            this.logger.debug(`updated pixel dimensions to ${this.pixelWidth}x${this.pixelHeight}`);
            this.setCanvasDimensions();
            this.render();
            this.emit('pixel_dimensions_change');
        }
    }

    public setName(newName: string): void {
        this.name = newName;
    }

    public setPixelData(pixelData: PixelInfo[][]): void {
        const newHash = PixelCanvas.generateHash(pixelData);
        const oldHash = PixelCanvas.generateHash(this.pixelData);

        if (oldHash === newHash) {
            this.logger.debug(`pixelData has no changes, doing nothing`);
            return;
        }

        this.pixelData = [];

        pixelData.forEach((row) => {
            const newRow: PixelInfo[] = [];
            row.forEach((data) => {
                newRow.push({ modeColorIndex: data.modeColorIndex });
            });

            this.pixelData.push(newRow);
        });

        this.render();
    }

    private get asmLabel(): string {
        return this.name.replace(/[^a-z0-9]/ig, '');
    }

    public generateCode(options: CodeGenerationOptions): string {
        const indent = options.indentChar;

        const code: string[] = [];
        let addressOffset = 0;
        let addressLabel = '';

        if (hasAddressLabel(options)) {
            addressLabel = options.addressLabel;
        } else {
            addressOffset = options.addressOffset || 0;
        }

        const pixelData = this.pixelData.slice(0, this.height);

        for (let i = pixelData.length - 1; i >= 0; i--) {
            const row = pixelData[i]!.slice(0, this.width);
            const coefficient = pixelData.length - i - 1;

            const offset = addressOffset + (0x100 * coefficient);
            const offsetFormatted = formatAssemblyNumber(offset, options.addressOffsetRadix);

            const address = addressLabel ? `${addressLabel}${offset !== 0 ? ' + ' + offsetFormatted : ''}` : offsetFormatted;

            code.push(`${indent}ORG ${address} ; line ${i + 1}`);
            code.push('');

            const comment = i === pixelData.length - 1 ? '' : '; ';
            code.push(`${comment}${this.asmLabel}${options.labelColon ? ':' : ''}`);

            const bytes = this.displayMode.convertPixelsToBytes(row);
            bytes.forEach(byte => code.push(`${indent}.byte ${formatAssemblyNumber(byte, options.byteRadix)}`));

            code.push('');
        }

        return code.join('\n');
    }

    public generateHeaderCode(options: CodeGenerationOptions): string {
        const indent = options.indentChar;

        const code = [
            `; 4-byte DL entry for ${this.asmLabel}, mode: ${this.displayMode.name}, ${this.width}x${this.height}`,
            `${this.asmLabel}Header${options.labelColon ? ':' : ''}`,
        ];

        const lowByte = hasAddressLabel(options) ?
            '<' + options.addressLabel :
            formatAssemblyNumber(options.addressOffset & 0x7F, 16);
        const highByte = hasAddressLabel(options) ?
            '>' + options.addressLabel :
            formatAssemblyNumber(options.addressOffset >> 8, 16);

        const paletteSet = this.group.getPaletteSet();
        const paletteIndex = paletteSet.getPalettes().findIndex(p => p === this.palette);
        if (!isPaletteIndex(paletteIndex)) {
            throw new Error(`Could not find ColorPalette{${this.palette.id}} in ColorPaletteSet{${paletteSet.id}}`);
        }

        const widthInBytes = this.width / (this.displayMode.pixelsPerByte);

        // lower 5 bits of 2's complement of the width in bytes
        const widthBitsMask = (2 ** DisplayMode.encodedWidthBits) - 1;
        const widthBits = (~widthInBytes + 1) & widthBitsMask;
        const byte2 = formatAssemblyNumber((paletteIndex << DisplayMode.encodedWidthBits) | widthBits, 2);

        code.push(`${indent}.byte ${lowByte}`);
        code.push(`${indent}.byte ${byte2}`);
        code.push(`${indent}.byte ${highByte}`);
        code.push(`${indent}.byte TODO ; horizontal position`);

        return code.join('\n');
    }

    public generatePalettesCode(options: CodeGenerationOptions): string {
        return this.group.getPaletteSet().generateCode(options);
    }

    public toJSON(): PixelCanvasSerialized {
        return {
            pixelWidth: this.pixelWidth,
            pixelHeight: this.pixelHeight,
            width: this.width,
            height: this.height,
            name: this.name,
            id: this.id,
            group: this.group.toJSON(),
            displayModeName: this.displayMode?.name || null,
            paletteId: this.palette.id,
            activeColor: this.activeColor,
            pixelData: this.pixelData.map((row) => {
                return row.map((pixel) => {
                    return {
                        modeColorIndex: pixel.modeColorIndex,
                    };
                });
            }),
        };
    }

    public static fromJSON(
        json: object,
        mountEl: HTMLElement,
        editorSettings: EditorSettings,
        groupCache: Record<ObjectGroup['id'], ObjectGroup>,
        paletteSets: Readonly<ColorPaletteSet[]>,
    ): PixelCanvas {
        if (!isSerialized(json)) {
            console.log(json);
            throw new Error('Cannot deserialize PixelCanvas, invalid JSON');
        }

        let group = groupCache[json.group.id];
        if (!group) {
            group = ObjectGroup.fromJSON(json.group, paletteSets);
            groupCache[group.id] = group;
        }

        const colorPalettes = paletteSets
            .map(set => set.getPalettes())
            .reduce((flattened, palettes) => flattened.concat(palettes), []);

        let colorPalette = colorPalettes.find(palette => palette.id === json.paletteId);
        if (!colorPalette) {
            colorPalette = colorPalettes[0];
            if (!colorPalette) {
                throw new Error(`Could not create color palette while deserializing PixelCanvas`);
            }
        }

        return new PixelCanvas({
            id: json.id,
            name: json.name,
            width: json.width,
            height: json.height,
            pixelWidth: json.pixelWidth,
            pixelHeight: json.pixelHeight,
            editorSettings,
            mountEl,
            group,
            displayMode: json.displayModeName,
            palette: colorPalette,
            activeColor: json.activeColor,
            pixelData: deserializePixelData(json.pixelData),
        });
    }

    public hasData(): boolean {
        return this.pixelData.some(row => row.some(data => data.modeColorIndex !== null));
    }
}

const isSerialized = (json: any): json is PixelCanvasSerialized => {
    if (typeof json !== 'object') {
        return false;
    }
    if (!json) {
        return false;
    }
    if (
        typeof json.width !== 'number' ||
        typeof json.height !== 'number' ||
        typeof json.pixelWidth !== 'number' ||
        typeof json.pixelHeight !== 'number' ||
        typeof json.displayModeName !== 'string' ||
        typeof json.activeColor !== 'number'
    ) {
        return false;
    }

    if (!Array.isArray(json.pixelData) || !json.pixelData.every((row: unknown) => Array.isArray(row))) {
        return false;
    }

    return true;
};

const deserializePixelData = (data: PixelInfoSerialized[][]): PixelInfo[][] => {
    return data.map((row) => row.map((item): PixelInfo => {
        return {
            modeColorIndex: item.modeColorIndex,
        };
    }));
};
