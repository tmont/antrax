import type { ColorPalette } from './ColorPalette.ts';
import type { ColorPaletteSet } from './ColorPaletteSet.ts';
import type { Atari7800Color } from './colors.ts';
import DisplayMode from './DisplayMode.ts';
import type { EditorSettings } from './Editor.ts';
import { type SerializationContext, SerializationTypeError } from './errors.ts';
import { EventEmitter } from './EventEmitter.ts';
import { Logger } from './Logger';
import { ObjectGroup } from './ObjectGroup.ts';
import {
    CodeGenerationDetailLevel,
    type CodeGenerationOptions,
    type Coordinate,
    type Dimensions,
    type DisplayModeColorIndex,
    type DisplayModeColorValue,
    type DisplayModeColorValueSerialized,
    type DisplayModeName,
    type DrawMode,
    formatAssemblyNumber,
    generateId,
    get2dContext,
    isLeftMouseButton,
    isPaletteIndex,
    nope,
    type PixelCanvasDrawState,
    type PixelCanvasDrawStateContext,
    type PixelInfo,
    type PixelInfoSerialized,
    type Rect
} from './utils.ts';

interface TransientPixelData {
    coordinate: Coordinate;
    pixel: PixelInfo;
    color: DisplayModeColorIndex | null;
}

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
    forceErase?: boolean; // erase even if it's not a user-initiated action
}

export type GeneratedImageSize = 'thumbnail' | 'full';

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

type PixelCanvasEventMap = {
    pixel_draw: [ PixelDrawingEvent ];
    pixel_draw_aggregate: [ Pick<PixelDrawingEvent, 'behavior'> ];
    pixel_hover: [ Coordinate, PixelInfo ];
    reset: [];
    draw_start: [];
    draw_state_change: [ Readonly<PixelCanvasDrawStateContext> ];
    pixel_dimensions_change: [];
    canvas_dimensions_change: [];
    display_mode_change: [];
    palette_change: [];
    active_color_change: [ DisplayModeColorIndex ];
    group_change: [];
    name_change: [];
};

export interface PixelCanvasSerialized {
    id: string | number;
    name: PixelCanvas['name'];
    pixelWidth: PixelCanvas['pixelWidth'];
    pixelHeight: PixelCanvas['pixelHeight'];
    width: PixelCanvas['width'];
    height: PixelCanvas['height'];
    pixelData: PixelInfoSerialized[][];
    displayModeName: DisplayModeName;
    paletteId: string | number;
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
    private readonly hoverCtx: CanvasRenderingContext2D;
    private readonly gridCtx: CanvasRenderingContext2D;
    private readonly bgCtx: CanvasRenderingContext2D;
    private readonly transientCtx: CanvasRenderingContext2D;
    private readonly logger: Logger;
    private readonly eventMap: Array<[ EventTarget, string, (...args: any[]) => void ]> = [];
    private pixelData: PixelInfo[][];
    private readonly $container: HTMLElement;
    private readonly $frameContainer: HTMLDivElement;
    private name: string;
    public readonly id: string;
    private group: ObjectGroup;
    private destroyed = false;
    private displayMode: DisplayMode;
    private palette: ColorPalette;
    private activeColor: DisplayModeColorIndex;

    private static instanceCount = 0;
    private static transparentPatternMap: Record<string, CanvasPattern> = {};

    private readonly $el: HTMLCanvasElement;
    private readonly $gridEl: HTMLCanvasElement;
    private readonly $hoverEl: HTMLCanvasElement;
    private readonly $bgEl: HTMLCanvasElement;
    private readonly $transientEl: HTMLCanvasElement;

    private transientState: TransientPixelData[] = [];
    private readonly drawContext: PixelCanvasDrawStateContext;

    public static readonly transparentColor1 = '#8f8f8f';
    public static readonly transparentColor2 = '#a8a8a8';

    public constructor(options: CanvasOptions) {
        super();
        PixelCanvas.instanceCount++;
        this.id = options.id || generateId();
        this.name = options.name || `Object ${PixelCanvas.instanceCount}`;
        this.logger = Logger.from(this);
        this.group = options.group;
        this.editorSettings = options.editorSettings;
        this.displayMode = options.displayMode instanceof DisplayMode ?
            options.displayMode :
            DisplayMode.create(options.displayMode);
        this.palette = options.palette;
        this.activeColor = options.activeColor || 0;
        this.drawContext = {
            state: 'idle',
            selection: null,
        };

        this.setActiveColor(this.activeColor);

        this.$container = options.mountEl;

        this.$frameContainer = document.createElement('div');
        this.$frameContainer.classList.add('frame-container');

        this.$el = document.createElement('canvas');
        this.$el.classList.add('editor');
        this.$frameContainer.appendChild(this.$el);

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

        this.ctx = get2dContext(this.$el);
        this.hoverCtx = get2dContext(this.$hoverEl);
        this.bgCtx = get2dContext(this.$bgEl);
        this.gridCtx = get2dContext(this.$gridEl);
        this.transientCtx = get2dContext(this.$transientEl);

        this.setCanvasDimensions();
        this.enable();
    }

    private getTransparentPattern(): CanvasPattern {
        const key = `${this.editorSettings.zoomLevel}:${this.pixelWidth}x${this.pixelHeight}`;
        let pattern = PixelCanvas.transparentPatternMap[key] || null;

        if (!pattern) {
            const $canvas = document.createElement('canvas');
            $canvas.width = Math.max(2, this.displayPixelWidth);
            $canvas.height = Math.max(2, this.displayPixelHeight); // use height instead?

            const ctx = get2dContext($canvas);

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

    public getDisplayDimensions(): Dimensions {
        return {
            width: this.displayWidth,
            height: this.displayHeight,
        };
    }

    public getHTMLRect(): Rect {
        return this.$el.getBoundingClientRect();
    }

    public getUnderlyingBackgroundCanvas(): HTMLCanvasElement {
        return this.$bgEl;
    }

    public getUnderlyingEditorCanvas(): HTMLCanvasElement {
        return this.$el;
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

    private get backgroundColor(): Readonly<Atari7800Color> {
        return this.group.getBackgroundColor();
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

    public getGroup(): ObjectGroup {
        return this.group;
    }

    public setGroup(newGroup: ObjectGroup): void {
        if (this.group === newGroup) {
            return;
        }

        this.logger.debug(`setting group to "${newGroup.getName()}" (${newGroup.id})`);
        this.group = newGroup;

        this.emit('group_change');
    }

    public hide(): void {
        if (this.destroyed) {
            return;
        }

        if (this.$frameContainer.style.display === 'none') {
            return;
        }

        this.logger.debug('hiding');
        this.disable();

        this.$frameContainer.style.display = 'none';
    }

    public show(): void {
        if (this.destroyed) {
            return;
        }

        if (this.$frameContainer.isConnected && this.$frameContainer.style.display !== 'none') {
            // it's currently visible and has already been attached to the DOM
            return;
        }

        this.logger.debug('showing');

        if (!this.$frameContainer.isConnected) {
            this.logger.debug('appending frame container and canvases');
            this.$container.appendChild(this.$frameContainer);
            this.$el.insertAdjacentElement('afterend', this.$gridEl);
            this.$el.insertAdjacentElement('afterend', this.$hoverEl);
            this.$el.insertAdjacentElement('afterend', this.$bgEl);
            this.$el.insertAdjacentElement('afterend', this.$transientEl);
        }

        this.$frameContainer.style.display = '';

        this.render();
        this.enable();
    }

    public destroy(): void {
        if (this.destroyed) {
            return;
        }

        this.disable();
        this.$frameContainer.remove();
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

        if (this.eventMap.length) {
            return;
        }
        this.logger.debug('enabling');

        let mouseDownOrigin: LocatedPixel | null = null;
        let lastDrawnPixel: PixelInfo | null = null;
        this.transientState = [];

        const transientCtx = this.transientCtx;

        const clampedDrawModes: Partial<Record<DrawMode, 1>> = {
            ellipse: 1,
            'ellipse-filled': 1,
            rect: 1,
            'rect-filled': 1,
            select: 1,
        };

        const activatePixelAtCursor = (e: MouseEvent): void => {
            switch (this.drawContext.state) {
                case 'drawing':
                case 'selecting':
                    break;
                case 'idle':
                case 'selected':
                    return;
                default:
                    nope(this.drawContext.state);
                    return;
            }

            const { clientX, clientY, ctrlKey: erasing } = e;
            const { top: offsetTop, left: offsetLeft } = this.$el.getBoundingClientRect();
            let trueX = clientX + document.documentElement.scrollLeft - offsetLeft;
            let trueY = clientY + document.documentElement.scrollTop - offsetTop;
            const { drawMode } = this.editorSettings;

            if (clampedDrawModes[drawMode]) {
                // in modes where you're dragging, we allow dragging off canvas, and we'll just
                // activate the closest pixel. this way the user won't have to have such precision
                // while dragging to keep the cursor on the canvas.
                trueX = Math.max(0, Math.min(trueX, this.displayWidth - 1));
                trueY = Math.max(0, Math.min(trueY, this.displayHeight - 1));
            }

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

            switch (drawMode) {
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

                case 'line':
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

                    // line mode stuff, origin is leftmost point
                    const m = (-pixelData.row + mouseDownOrigin.row) / (pixelData.col - mouseDownOrigin.col);
                    const origin: Coordinate = {
                        x: pixelData.col < mouseDownOrigin.col ? pixelData.col : mouseDownOrigin.col,
                        y: pixelData.col < mouseDownOrigin.col ? pixelData.row : mouseDownOrigin.row,
                    };

                    this.clearTransientRect();
                    this.transientState = [];
                    for (let row = start.y; row <= start.y + height; row++) {
                        for (let col = start.x; col <= start.x + width; col++) {
                            const pixel = this.pixelData[row]?.[col];
                            if (!pixel) {
                                continue;
                            }

                            if (drawMode === 'rect') {
                                // only color the outer edges
                                if (
                                    row !== start.y &&
                                    row !== start.y + height &&
                                    col !== start.x &&
                                    col !== start.x + width
                                ) {
                                    continue;
                                }
                            } else if (drawMode === 'ellipse-filled' || drawMode === 'ellipse') {
                                const w = Math.floor(width / 2);
                                const h = Math.floor(height / 2);
                                const x = col - start.x - w;
                                const y = row - start.y - h;

                                const value = ((x * x) / (w * w)) + ((y * y) / (h * h));

                                if (drawMode === 'ellipse-filled') {
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
                            } else if (drawMode === 'line') {
                                if (isNaN(m)) {
                                    // vertical line
                                    if (col !== mouseDownOrigin.col) {
                                        continue;
                                    }
                                } else {
                                    // if slope is greater than one, rotate everything 90 degrees so that
                                    // rounding works to make a contiguous line. i'm doing my best :(
                                    const smallSlope = Math.abs(m) <= 1;
                                    const x = smallSlope ? col - origin.x : origin.y - row;
                                    const y = smallSlope ? origin.y - row : col - origin.x;
                                    let m2 = smallSlope ? m : 1 / m;
                                    const mxb = m2 * x; // we force b = 0 here
                                    if (Math.round(mxb) !== (y)) {
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
                                this.transientState.push({
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

                case 'draw':
                    this.drawPixelFromRowAndCol(pixelCoordinate, pixelData.pixel, { behavior: 'user', erasing });
                    break;

                case 'select': {
                    // this is similar to the shape drawing, except we're not going to draw any pixels,
                    // just outline a rectangle
                    if (!mouseDownOrigin) {
                        mouseDownOrigin = pixelData;
                    }

                    const width = Math.abs(mouseDownOrigin.col - pixelData.col) + 1;
                    const height = Math.abs(mouseDownOrigin.row - pixelData.row) + 1;
                    const start: Coordinate = {
                        x: Math.min(mouseDownOrigin.col, pixelData.col),
                        y: Math.min(mouseDownOrigin.row, pixelData.row),
                    };

                    this.drawContext.selection = {
                        x: start.x,
                        y: start.y,
                        width,
                        height,
                    };

                    this.renderTransient();
                    break;
                }

                default:
                    nope(drawMode);
                    throw new Error(`Unknow drawMode "${drawMode}"`);
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

        const onMouseMove = (e: MouseEvent): void => {
            activatePixelAtCursor(e);
        };

        const onMouseDown = (e: MouseEvent) => {
            if (e.shiftKey) {
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

            if (this.editorSettings.drawMode === 'select') {
                this.setDrawState('selecting');
            } else {
                this.setDrawState('drawing');
                this.emit('draw_start');
            }

            this.unhighlightPixel();

            activatePixelAtCursor(e);
            this.addEvent(this.$el.ownerDocument, 'mousemove', onMouseMove);
        };

        const onMouseUp = () => {
            this.$el.removeEventListener('mousemove', onMouseMove);
            switch (this.drawContext.state) {
                case 'drawing':
                    this.setDrawState('idle');
                    break;
                case 'selecting':
                    this.setDrawState('selected');
                    break;
                case 'selected':
                case 'idle':
                    break;
                default:
                    nope(this.drawContext.state);
                    break;
            }

            mouseDownOrigin = null;
            lastDrawnPixel = null;
            this.finalizeTransientState();
        };

        const onHover = (e: MouseEvent): void => {
            if (this.drawContext.state !== 'idle') {
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

    public generateDataURL(callback: (url: string | null) => void, size: GeneratedImageSize = 'thumbnail'): void {
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
    }

    public copyImageToCanvas($canvas: HTMLCanvasElement, maxSize: number = Infinity): void {
        const width = this.displayWidth;
        const height = this.displayHeight;
        const maxDimension = Math.max(width, height);
        const scale = maxDimension <= maxSize ? 1 : maxSize / maxDimension;

        $canvas.width = width * scale;
        $canvas.height = height * scale;

        const ctx = get2dContext($canvas);
        ctx.drawImage(this.$bgEl, 0, 0, $canvas.width, $canvas.height);
        ctx.drawImage(this.$el, 0, 0, $canvas.width, $canvas.height);
    }

    private setDrawState(newState: PixelCanvasDrawState): void {
        if (this.drawContext.state === newState) {
            return;
        }

        this.logger.info(`setting drawState to ${newState}`);
        this.drawContext.state = newState;

        switch (this.drawContext.state) {
            case 'drawing':
            case 'selecting':
            case 'idle':
                this.drawContext.selection = null;
                break;
            case 'selected':
                break;
            default:
                nope(this.drawContext.state);
                throw new Error(`unknown draw state "${this.drawContext.state}"`);
        }

        this.emit('draw_state_change', this.drawContext);
    }

    public resetDrawContext(): void {
        this.setDrawState('idle');
        this.transientState = [];
        this.transientCtx.clearRect(0, 0, this.$transientEl.width, this.$transientEl.height);
    }

    private finalizeTransientState(): void {
        let drawn = false;

        if (this.drawContext.state !== 'selecting' && this.drawContext.state !== 'selected') {
            while (this.transientState.length) {
                const data = this.transientState.pop()!;
                drawn = this.drawPixelFromRowAndCol(data.coordinate, data.pixel, {
                    behavior: 'user',
                    emit: false,
                }) || drawn;
            }
            this.clearRect(0, 0, this.$transientEl.width, this.$transientEl.height, this.transientCtx);
        }

        if (drawn) {
            this.emit('pixel_draw_aggregate', { behavior: 'user' });
        }
    }

    public getDrawState(): PixelCanvasDrawState {
        return this.drawContext.state;
    }

    public getSelectionPixelData(): PixelInfo[][] {
        if (!this.drawContext.selection) {
            return [];
        }

        const copiedData: PixelInfo[][] = [];

        const { x, y, width, height } = this.drawContext.selection;

        for (let i = y; i < y + height; i++) {
            const row: PixelInfo[] = [];
            for (let j = x; j < x + width; j++) {
                const pixel = this.pixelData[i]?.[j];
                if (pixel) {
                    row.push({
                        modeColorIndex: pixel.modeColorIndex,
                    });
                } else {
                    this.logger.warn(`no pixel data at ${i},${j}`);
                }
            }

            if (row.length) {
                copiedData.push(row);
            }
        }

        return copiedData;
    }

    public eraseSelection(rect: Rect): void {
        if (!rect.width || !rect.height) {
            return;
        }

        let eraseCount = 0;
        for (let y = rect.y; y < rect.y + rect.height; y++) {
            const row = this.pixelData[y];
            if (!row) {
                continue;
            }

            for (let x = rect.x; x < rect.x + rect.width; x++) {
                const pixel = row[x];
                if (!pixel) {
                    break;
                }
                pixel.modeColorIndex = null;
                eraseCount++;
            }
        }

        this.clearRect(
            rect.x * this.displayPixelWidth,
            rect.y * this.displayPixelHeight,
            rect.width * this.displayPixelWidth,
            rect.height * this.displayPixelHeight,
        );

        const totalCount = rect.width * rect.height;
        this.logger.debug(`erased ${eraseCount}/${totalCount} pixel${eraseCount === 1 ? '' : 's'} from selection`);
    }

    public flipSelection(rect: Rect, dir: 'horizontal' | 'vertical'): void {
        if (!rect.width || !rect.height) {
            return;
        }
        if ((rect.width === 1 && dir === 'horizontal') || (rect.height === 1 && dir === 'vertical')) {
            // can't flip a single unit
            return;
        }

        if (dir === 'horizontal') {
            throw new Error('not implemented yet');
        }

        let flipCount = 0;
        for (let y = 0; y < Math.floor(rect.height / 2); y++) {
            const topY = rect.y + y;
            const botY = rect.y + rect.height - 1 - y;
            const topRow = this.pixelData[topY];
            const bottomRow = this.pixelData[botY];
            if (!topRow || !bottomRow) {
                break;
            }

            for (let x = rect.x; x < rect.x + rect.width; x++) {
                const topValue = topRow[x];
                const bottomValue = bottomRow[x];
                if (!topValue || !bottomValue) {
                    break;
                }

                topRow[x] = bottomValue;
                bottomRow[x] = topValue;
                flipCount += 2;

                // forceErase is needed since we are not clearing the selection first. normally we could
                // we just clear the relevant rect and not need forceErase, but we are not processing the
                // middle row if there is an odd number of rows, so it'll be erased entirely if we clear
                // everything first.
                this.drawPixelFromRowAndCol({ x, y: topY }, bottomValue, {
                    emit: false,
                    behavior: 'internal',
                    immutable: true,
                    forceErase: true
                });
                this.drawPixelFromRowAndCol({ x, y: botY }, topValue, {
                    emit: false,
                    behavior: 'internal',
                    immutable: true,
                    forceErase: true,
                });
            }
        }

        const totalCount = rect.width * rect.height;
        this.logger.debug(`${dir}ly flipped ${flipCount}/${totalCount} pixel${flipCount === 1 ? '' : 's'} from selection`);

        if (flipCount) {
            this.emit('pixel_draw_aggregate', { behavior: 'user' });
        }
    }

    public clear(): void {
        this.logger.debug(`clearing canvas`);
        this.clearRect(0, 0, this.displayWidth, this.displayHeight);
    }

    public reset(): void {
        this.logger.debug(`resetting canvas`);
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

    private clearTransientRect(): void {
        this.clearRect(0, 0, this.$transientEl.width, this.$transientEl.height, this.transientCtx);
    }

    private drawHoverStyleRect(
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        width: number,
        height: number,
        lineWidthDivisor = 25,
    ): void {
        const dashSize = Math.max(2, Math.round(this.displayPixelWidth / 15));
        ctx.strokeStyle = 'rgba(80, 80, 164, 0.75)';
        ctx.setLineDash([ dashSize, dashSize ]);
        ctx.lineWidth = Math.max(1, Math.round(this.displayPixelWidth / lineWidthDivisor));
        ctx.fillStyle = 'rgba(164, 164, 255, 0.35)';
        ctx.strokeRect(x, y, width, height);
        ctx.fillRect(x, y, width, height);

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
        this.renderTransient();
        this.logger.debug(`rendering complete in ${Date.now() - start}ms`);
        this.emit('pixel_draw_aggregate', { behavior: 'internal' });
    }

    public renderBg(): void {
        if (this.destroyed) {
            return;
        }

        const ctx = this.bgCtx;

        this.logger.debug('rendering bg');

        ctx.clearRect(0, 0, this.$bgEl.width, this.$bgEl.height);

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
                canvas.width = this.displayPixelWidth;
                canvas.height = this.displayPixelHeight;

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
        ctx.fillRect(0, 0, this.$bgEl.width, this.$bgEl.height);
    }

    public renderGrid(): void {
        if (this.destroyed) {
            return;
        }

        const ctx = this.gridCtx;

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

    public renderTransient(): void {
        const { selection, state } = this.drawContext;
        if (!selection || (state !== 'selected' && state !== 'selecting')) {
            return;
        }

        this.logger.debug(`rendering selection on transient canvas`);
        const x = selection.x * this.displayPixelWidth;
        const y = selection.y * this.displayPixelHeight;
        const w = selection.width * this.displayPixelWidth;
        const h = selection.height * this.displayPixelHeight;

        this.clearTransientRect();
        this.drawHoverStyleRect(this.transientCtx, x, y, w, h, 12);
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
        const shouldErase = isUserAction || options.forceErase === true;

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
            if (shouldErase) {
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
                if (shouldErase) {
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
                        ctx.fillStyle = this.backgroundColor.hex;
                        ctx.fillRect(x, absoluteCoordinate.y, width, this.displayPixelHeight);
                    } else if (color.value === 'transparent') {
                        if (shouldErase) {
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

        const { x, y } = this.convertPixelToAbsoluteCoordinate(pixelRowAndCol);
        this.drawHoverStyleRect(this.hoverCtx, x, y, this.displayPixelWidth, this.displayPixelHeight);

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

        this.hoverCtx.clearRect(0, 0, this.displayWidth, this.displayHeight);
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

    public setZoomLevel(forceRender = true): void {
        this.setCanvasDimensions();
        if (forceRender) {
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
        if (this.name === newName) {
            return;
        }

        this.name = newName;
        this.emit('name_change');
    }

    public setPixelData(pixelData: PixelInfo[][]): void {
        const newHash = PixelCanvas.generateHash(pixelData);
        const oldHash = PixelCanvas.generateHash(this.pixelData);

        if (oldHash === newHash) {
            this.logger.debug(`pixelData has no changes, doing nothing`);
            return;
        }

        this.pixelData = [];

        for (let row = 0; row < this.height; row++) {
            this.pixelData[row] = [];
            for (let col = 0; col < this.width; col++) {
                this.pixelData[row]!.push({
                    modeColorIndex: pixelData[row]?.[col]?.modeColorIndex || null,
                });
            }
        }

        this.render();
    }

    /**
     * Applies a rectangular set of pixel data to a rectangular part of the
     * canvas. The rectangles do not need to be the same size, the new data
     * will fit to the given location and discard unused pixels.
     * @return {int} The number of pixels that were drawn
     */
    public applyPartialPixelData(pixelData: PixelInfo[][], location: Rect): number {
        let drawCount = 0;
        const totalCount = pixelData.length & (pixelData[0]?.length || 0);
        for (let i = 0; i < pixelData.length && i < location.height; i++) {
            const row = pixelData[i]!;
            let actualRow = location.y + i;
            for (let j = 0; j < row.length && j < location.width; j++) {
                const data = row[j]!;
                let actualCol = location.x + j;
                if (this.pixelData[actualRow]?.[actualCol]) {
                    this.pixelData[actualRow][actualCol].modeColorIndex = data.modeColorIndex;
                    drawCount++;
                }
            }
        }

        this.logger.info(`applied ${drawCount}/${totalCount} pixels from external pixel data`);

        this.render();

        // this is important so that we push onto the undo stack
        this.emit('pixel_draw_aggregate', { behavior: 'user' });

        return drawCount;
    }

    public getCurrentSelection(): Readonly<PixelCanvasDrawStateContext['selection']> {
        return this.drawContext.selection;
    }

    public get asmLabel(): string {
        return this.name.replace(/[^a-z0-9]/ig, '');
    }

    public generateByteLineChunks(options: CodeGenerationOptions): string[][] {
        const indent = options.indentChar;

        const lines: string[][] = [];
        const pixelData = this.pixelData.slice(0, this.height);

        if (options.padToHeight && isFinite(options.padToHeight)) {
            // add empty rows to the bottom to make up for the remaining height
            while (pixelData.length < options.padToHeight) {
                pixelData.push(new Array(this.width).fill({ modeColorIndex: null }));
            }
        }

        for (let i = 0; i < pixelData.length; i++) {
            const row = pixelData[i]!.slice(0, this.width);
            const lineBytes: string[] = [];

            const bytes = this.displayMode.convertPixelsToBytes(row);

            let pixelColors: string[][] = [];
            if (options.commentLevel >= CodeGenerationDetailLevel.Lots) {
                const colorLabels = this.getColors().map(color => color.colors.map(c => c.label));
                pixelColors = row.map(pixel => colorLabels[pixel.modeColorIndex || 0] || [ `[${pixel.modeColorIndex}]?` ]);
            }

            bytes.forEach((byte, byteIndex) => {
                let line = `${indent}.byte ${formatAssemblyNumber(byte, options.byteRadix)}`;
                const byteColors = pixelColors.slice(byteIndex * this.displayMode.pixelsPerByte, (byteIndex + 1) * this.displayMode.pixelsPerByte);
                let comment = '';
                if (options.commentLevel >= CodeGenerationDetailLevel.Some) {
                    if (options.commentLevel >= CodeGenerationDetailLevel.Lots) {
                        comment += ' ' + byteColors.map(label => label.join(',')).join(' ');
                    }

                    if (i >= this.height) {
                        comment += ' (padded)';
                    }
                }

                comment = comment ? ' ;' + comment : '';
                lineBytes.push(line + comment);
            });

            lines.push(lineBytes);
        }

        return lines;
    }

    public generateHeaderCode(options: CodeGenerationOptions): string {
        const indent = options.indentChar;

        const paletteSet = this.group.getPaletteSet();
        const paletteIndex = paletteSet.getPalettes().indexOf(this.palette);
        if (!isPaletteIndex(paletteIndex)) {
            throw new Error(`Could not find ColorPalette{${this.palette.id}} in ColorPaletteSet{${paletteSet.id}}`);
        }

        // sanity check
        if (this.width % this.displayMode.pixelsPerByte !== 0) {
            throw new Error(`Width (${this.width}) is not a multiple of ${this.displayMode.pixelsPerByte}`);
        }

        const widthInBytes = this.width / this.displayMode.pixelsPerByte;

        // lower bits of 2's complement of the width in bytes
        const widthBitsMask = (2 ** DisplayMode.encodedWidthBits) - 1;
        const widthBits = (~widthInBytes + 1) & widthBitsMask;
        const byte2 = formatAssemblyNumber((paletteIndex << DisplayMode.encodedWidthBits) | widthBits, 2);

        const headerSegments: string[] = [];
        const paletteSegments: string[] = [];
        const paletteExtra: string[] = [];

        if (options.commentLevel >= CodeGenerationDetailLevel.Some) {
            paletteSegments.push(`Palette=${paletteIndex}`);
            paletteSegments.push(`ByteWidth=${widthInBytes}`);
        }

        if (options.commentLevel >= CodeGenerationDetailLevel.Lots) {
            headerSegments.push(`Mode=${this.displayMode.name}${this.editorSettings.kangarooMode ? '[K]' : ''}`);
            headerSegments.push(`Width=${this.width}`);
            headerSegments.push(`Height=${this.height}`);
            headerSegments.push(`PixelsPerByte=${this.displayMode.pixelsPerByte}`);
            headerSegments.push(`TotalSize=${widthInBytes * this.height}`);

            paletteExtra.push(`${indent}                └─┘└───┘`);
            paletteExtra.push(`${indent}    Palette ${paletteIndex} ───┘   ` +
                `└───── ~(${this.width} / ${this.displayMode.pixelsPerByte}) + 1 & %${widthBitsMask.toString(2)}`);

        } else if (options.commentLevel >= CodeGenerationDetailLevel.Some) {
            headerSegments.push(`Mode=${this.displayMode.name}`);
            headerSegments.push(`Dimensions=${this.width}x${this.height}`);
        }

        const code = [
            `/* ${this.name}${headerSegments.length ? ` (${headerSegments.join(', ')})` : ''}`,
            `${indent}Address:       ${this.asmLabel}`,
            `${indent}Palette/Width: ${byte2}${paletteSegments.length ? ` (${paletteSegments.join(', ')})` : ''}`,
            ...paletteExtra,
        ];

        code.push('*/');

        return code.join('\n');
    }

    public generatePalettesCode(options: CodeGenerationOptions): string {
        return this.group.getPaletteSet().generateCode(options);
    }

    public clone(): PixelCanvas {
        return new PixelCanvas({
            mountEl: this.$container,
            pixelWidth: this.pixelWidth,
            pixelHeight: this.pixelHeight,
            width: this.width,
            height: this.height,
            pixelData: this.clonePixelData(),
            displayMode: this.displayMode,
            palette: this.palette,
            editorSettings: this.editorSettings,
            group: this.group,
            activeColor: this.activeColor,
        });
    }

    public toJSON(): PixelCanvasSerialized {
        return {
            pixelWidth: this.pixelWidth,
            pixelHeight: this.pixelHeight,
            width: this.width,
            height: this.height,
            name: this.name,
            id: this.id,
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
        group: ObjectGroup,
        paletteSets: Readonly<ColorPaletteSet[]>,
    ): PixelCanvas {
        const serialized = this.transformSerialized(json);

        const colorPalettes = paletteSets
            .map(set => set.getPalettes())
            .reduce((flattened, palettes) => flattened.concat(palettes), []);

        let colorPalette = colorPalettes.find(palette => palette.id === serialized.paletteId);
        if (!colorPalette) {
            colorPalette = colorPalettes[0];
            if (!colorPalette) {
                throw new Error(`Could not create color palette while deserializing PixelCanvas`);
            }
        }

        return new PixelCanvas({
            id: String(serialized.id),
            name: serialized.name,
            width: serialized.width,
            height: serialized.height,
            pixelWidth: serialized.pixelWidth,
            pixelHeight: serialized.pixelHeight,
            editorSettings,
            mountEl,
            group,
            displayMode: serialized.displayModeName,
            palette: colorPalette,
            activeColor: serialized.activeColor,
            pixelData: serialized.pixelData.map(row => row.map(item => ({ modeColorIndex: item.modeColorIndex }))),
        });
    }

    public static transformSerialized(json: any): PixelCanvasSerialized {
        const context: SerializationContext = 'PixelCanvas';

        if (!json.id || (typeof json.id !== 'string' && typeof json.id !== 'number')) {
            throw new SerializationTypeError(context, 'id', 'non-empty string or number', json.id);
        }

        ([
            [ 'name', 'string' ],
            [ 'width', 'number' ],
            [ 'height', 'number' ],
            [ 'pixelWidth', 'number' ],
            [ 'pixelHeight', 'number' ],
            [ 'displayModeName', 'string' ],
            [ 'activeColor', 'number' ],
        ] as [ string, string ][]).forEach(([ key, expectedType ]) => {
            const actual = json[key];
            if (typeof actual !== expectedType) {
                throw new SerializationTypeError(context, key, expectedType, actual);
            }
        });

        if (!Array.isArray(json.pixelData) || !json.pixelData.every((row: unknown) => Array.isArray(row))) {
            throw new SerializationTypeError(context, 'pixelData', 'array of arrays');
        }

        if (!json.paletteId || (typeof json.paletteId !== 'string' && typeof json.paletteId !== 'number')) {
            throw new SerializationTypeError(context, 'paletteId', 'non-empty string or number', json.paletteId);
        }

        return json;
    }

    public hasData(): boolean {
        return this.pixelData.some(row => row.some(data => data.modeColorIndex !== null));
    }
}
