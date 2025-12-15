import type { ColorPalette } from '../ColorPalette.ts';
import type { ColorPaletteSet } from '../ColorPaletteSet.ts';
import DisplayMode from '../DisplayMode.ts';
import type { EditorSettings } from '../Editor.ts';
import { type SerializationContext, SerializationTypeError } from '../errors.ts';
import { ObjectGroup } from '../ObjectGroup.ts';
import {
    clamp,
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
    type LocatedPixel,
    nope,
    type PaletteIndex,
    type PixelCanvasDrawState,
    type PixelCanvasDrawStateContext,
    type PixelInfo,
    type PixelInfoSerialized,
    type Rect
} from '../utils.ts';
import { BackgroundCanvas } from './BackgroundCanvas.ts';
import { BaseCanvas, type BaseCanvasOptions } from './BaseCanvas.ts';
import { GridCanvas } from './GridCanvas.ts';
import { HoverCanvas } from './HoverCanvas.ts';
import { TransientCanvas } from './TransientCanvas.ts';
import type { EditorCanvas } from './types.ts';

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
    paletteSet: ColorPaletteSet;
    activeColor?: DisplayModeColorIndex;
}

interface DrawPixelOptions {
    behavior: PixelDrawingBehavior;
    color: DisplayModeColorIndex | null;
    emit: boolean; // emit pixel_draw, defaults to true
    ctx?: CanvasRenderingContext2D;
    immutable?: boolean; // do not update the pixel's color, defaults to false
    allowErasure: boolean;
}

export type PixelDrawingBehavior =
    // the user initiated the draw action
    'user' |
    // internal system (e.g. rendering) initiated the draw action
    'internal';

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
    palette_set_change: [];
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

export class PixelCanvas extends BaseCanvas<PixelCanvasEventMap> implements EditorCanvas {
    private readonly eventMap: Array<[ EventTarget, string, (...args: any[]) => void ]> = [];
    private pixelData: PixelInfo[][];
    private readonly $container: HTMLElement;
    private name: string;
    public readonly id: string;
    private group: ObjectGroup;
    private destroyed = false;
    private activeColor: DisplayModeColorIndex;

    private static instanceCount = 0;

    private readonly hoverCanvas: HoverCanvas;
    private readonly bgCanvas: BackgroundCanvas;
    private readonly transientCanvas: TransientCanvas;
    private readonly gridCanvas: GridCanvas;

    private transientState: TransientPixelData[] = [];
    private readonly drawContext: PixelCanvasDrawStateContext;

    public constructor(options: CanvasOptions) {
        const baseOptions: BaseCanvasOptions = {
            canvasSettings: {
                displayMode: options.displayMode instanceof DisplayMode ?
                    options.displayMode :
                    DisplayMode.create(options.displayMode),
                height: options.height,
                width: options.width,
                magnificationScale: 4,
                palette: options.palette,
                paletteSet: options.paletteSet,
                pixelHeight: options.pixelHeight,
                pixelWidth: options.pixelWidth,
            },
            editorSettings: options.editorSettings,
            $frameContainer: document.createElement('div'),
        };

        super(baseOptions);

        PixelCanvas.instanceCount++;
        this.id = options.id || generateId();
        this.name = options.name || `Object ${PixelCanvas.instanceCount}`;
        this.group = options.group;

        if (this.paletteSet.getPalettes().indexOf(this.palette) === -1) {
            throw new Error(`ColorPalette{${this.palette.id}} does not belong to ColorPaletteSet{${this.paletteSet.id}}`);
        }

        this.activeColor = options.activeColor || 0;
        this.drawContext = {
            state: 'idle',
            selection: null,
            movedData: [],
            mouseDownOrigin: null,
            moveOffset: null,
            eraseOnMove: true,
        };

        this.setActiveColor(this.activeColor);

        this.$container = options.mountEl;

        this.$frameContainer.classList.add('frame-container');
        this.$frameContainer.appendChild(this.$el);

        this.pixelData = options.pixelData || [];
        this.logger.info(`setting display to ${this.displayWidth}x${this.displayHeight}`);

        this.hoverCanvas = new HoverCanvas(baseOptions);
        this.bgCanvas = new BackgroundCanvas(baseOptions);
        this.transientCanvas = new TransientCanvas(baseOptions);
        this.gridCanvas = new GridCanvas(baseOptions);

        this.setCanvasDimensions();
        this.enable();
    }

    protected get canvasClassName(): string[] {
        return [ 'editor' ];
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

    public getDisplayDimensionsForPixelSize(pixelSize: Dimensions): Dimensions {
        return {
            width: pixelSize.width * this.width * this.editorSettings.zoomLevel,
            height: pixelSize.height * this.height * this.editorSettings.zoomLevel,
        };
    }

    public getHTMLRect(): Rect {
        return this.$el.getBoundingClientRect();
    }

    public drawBackgroundOnto(
        context: CanvasRenderingContext2D,
        x: number,
        y: number,
        width: number,
        height: number,
    ): void {
        this.bgCanvas.drawImageOnto(context, x, y, width, height);
    }

    public getName(): string {
        return this.name;
    }

    public getActiveColor(): DisplayModeColorIndex {
        return this.activeColor;
    }

    public setActiveColor(modeColorIndex: DisplayModeColorIndex): void {
        this.activeColor = modeColorIndex;
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

    private setCanvasDimensions(): void {
        if (this.destroyed) {
            return;
        }

        // TODO use same magnification for zoomLevel > 1, speeds up drawing quite a bit at
        // high resolutions on large canvases. problem is the selection/hover style is terrible
        // due to the dotted line stroke width.
        this.settings.magnificationScale = this.editorSettings.zoomLevel < 1 ?
            1 / this.editorSettings.zoomLevel :
            1;

        this.$frameContainer.style.width = this.displayWidth + 'px';
        this.$frameContainer.style.height = this.displayHeight + 'px';

        const canvases: BaseCanvas[] = [
            this,
            this.gridCanvas,
            this.hoverCanvas,
            this.bgCanvas,
            this.transientCanvas,
        ];
        canvases.forEach(canvas => canvas.syncInternalDimensions());

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

    public supportsKangarooMode(): boolean {
        return this.settings.displayMode.supportsKangarooMode;
    }

    public canExportToASM(): boolean {
        return this.settings.displayMode.canExportToASM;
    }

    public setDisplayMode(newMode: DisplayMode | DisplayModeName): void {
        if (typeof newMode === 'string') {
            newMode = DisplayMode.create(newMode);
        }
        this.settings.displayMode = newMode;
        this.setActiveColor(0);
        this.emit('display_mode_change');
    }

    public setColorPalette(newPalette: ColorPalette): void {
        this.setColorPaletteWithoutEvents(newPalette);
        this.emit('palette_change');
    }

    private setColorPaletteWithoutEvents(newPalette: ColorPalette): void {
        if (this.palette === newPalette) {
            return;
        }

        if (this.paletteSet.getPalettes().indexOf(newPalette) === -1) {
            // if the palette set+palette changes, the palette set MUST be updated first, see setColorPaletteSet()
            throw new Error(`Cannot set color palette to ${newPalette.id} because it is not a part of palette set ${this.paletteSet.getName()}`);
        }

        this.settings.palette = newPalette;
        this.logger.debug(`setting color palette to ${this.palette.name} {${this.palette.id}}`);
        this.render();
    }

    public setColorPaletteSet(newPaletteSet: ColorPaletteSet, paletteIndex?: PaletteIndex): void {
        if (this.paletteSet === newPaletteSet) {
            return;
        }

        let oldPaletteIndex = typeof paletteIndex === 'number' ?
            paletteIndex :
            this.paletteSet.getPalettes().indexOf(this.palette);

        if (!isPaletteIndex(oldPaletteIndex)) {
            oldPaletteIndex = 0;
        }

        this.settings.paletteSet = newPaletteSet;
        this.logger.debug(`setting color palette set to ${this.paletteSet.getName()} {${this.paletteSet.id}}`);

        const newPalettes = this.paletteSet.getPalettes();
        if (newPalettes.indexOf(this.palette) === -1) {
            // if the current palette is not part of the new palette set, update the palette. try to match the
            // old palette index if possible (e.g. P5 in old set -> P5 in new set)

            if (newPalettes[oldPaletteIndex]) {
                this.setColorPaletteWithoutEvents(newPalettes[oldPaletteIndex]!);
            } else if (!newPalettes[0]) {
                throw new Error(`ColorPaletteSet{${this.paletteSet.id}} has no palettes`);
            } else {
                this.setColorPaletteWithoutEvents(newPalettes[0]);
            }
        }

        // NOTE: these can't be emitted until both paletteSet and palette have been updated
        this.emit('palette_set_change');
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
            this.gridCanvas.show();
            this.hoverCanvas.show();
            this.transientCanvas.show();
            this.bgCanvas.show();
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

        const transientCtx = this.transientCanvas.getRenderingContext();

        const clampedDrawModes: Partial<Record<DrawMode, 1>> = {
            ellipse: 1,
            'ellipse-filled': 1,
            line: 1,
            rect: 1,
            'rect-filled': 1,
            select: 1,
            move: 1,
        };

        const activatePixelAtCursor = (e: { clientX: number; clientY: number; ctrlKey: boolean }): void => {
            switch (this.drawContext.state) {
                case 'drawing':
                case 'selecting':
                case 'moving':
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
                trueX = clamp(0, this.displayWidth - 1, trueX);
                trueY = clamp(0, this.displayHeight - 1, trueY);
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
                            color: erasing ? null : this.activeColor,
                            emit: false,
                            allowErasure: true,
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
                    this.drawPixelFromRowAndCol(pixelCoordinate, pixelData.pixel, {
                        behavior: 'user',
                        color: null,
                        emit: true,
                        allowErasure: true,
                    });
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
                                color: this.activeColor,
                                emit: false,
                                ctx: transientCtx,
                                immutable: true,
                                allowErasure: true,
                            });

                            if (drawn) {
                                this.transientState.push({
                                    color: this.activeColor,
                                    coordinate: {
                                        x: col,
                                        y: row,
                                    },
                                    pixel, // NOTE: pixel must not be de-referenced
                                });
                            }
                        }
                    }

                    break;
                }

                case 'draw':
                    this.drawPixelFromRowAndCol(pixelCoordinate, pixelData.pixel, {
                        behavior: 'user',
                        color: erasing ? null : this.activeColor,
                        emit: true,
                        allowErasure: true,
                    });
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

                    this.renderSelection();
                    break;
                }

                case 'move': {
                    if (!this.drawContext.selection) {
                        this.logger.error(`in "move" state but there is no selection`, this.drawContext);
                        return;
                    }

                    if (!this.drawContext.mouseDownOrigin) {
                        this.drawContext.mouseDownOrigin = pixelData;

                        // we allow dragging anywhere on the canvas to move the selection around, but it
                        // moves relative to the cursor's current position
                        this.drawContext.moveOffset = {
                            x: pixelData.col - this.drawContext.selection.x,
                            y: pixelData.row - this.drawContext.selection.y,
                        };
                    }

                    // if first time it's moved, store current selection's pixel data, and delete selection
                    // then, render selection's pixel data onto transient
                    // move selection to new pixel
                    // NOTE: this isn't on mousedown, because you can lift your mouse and move the same
                    // selection again, but we want to move the previously selected pixel data, not the currently
                    // selected pixel data.
                    if (!this.drawContext.movedData.length) {
                        const movedData = this.getSelectionPixelData();
                        if (this.drawContext.eraseOnMove) {
                            this.logger.info(`first move: erasing current selection`);
                            this.eraseCurrentSelection();
                        }
                        this.drawContext.movedData = movedData;
                    }

                    if (!this.drawContext.moveOffset) {
                        throw new Error(`drawContext.moveOffset not set?`);
                    }

                    const movedLocation: Coordinate = {
                        x: pixelData.col - this.drawContext.moveOffset.x,
                        y: pixelData.row - this.drawContext.moveOffset.y,
                    };

                    // move selection to the new location
                    this.drawContext.selection = {
                        ...this.drawContext.selection,
                        ...movedLocation,
                    };

                    this.transientState = [];

                    // render movedData onto the transient rect
                    this.renderSelection((pixel, coordinate) => {
                        // the pixel we'll draw to the real canvas is different from the one we just drew
                        // to the transient canvas
                        const pixelToDraw = this.pixelData[coordinate.y]?.[coordinate.x];
                        if (pixelToDraw) {
                            this.transientState.push({
                                color: pixel.modeColorIndex,
                                coordinate,
                                pixel: pixelToDraw,
                            });
                        }
                    });
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

        const onTouchMove = (e: TouchEvent): void => {
            const touch = e.touches.item(0);
            if (!touch) {
                return;
            }

            activatePixelAtCursor({
                clientX: touch.clientX,
                clientY: touch.clientY,
                ctrlKey: false,
            });
        };

        const onTouchStart = (e: TouchEvent): void => {
            const touch = e.touches.item(0);
            if (!touch) {
                return;
            }

            startDrawing();

            activatePixelAtCursor({
                clientX: touch.clientX,
                clientY: touch.clientY,
                ctrlKey: false,
            });

            this.addEvent(this.$el.ownerDocument, 'touchmove', onTouchMove);
        };

        const startDrawing = () => {
            if (this.editorSettings.drawMode === 'select') {
                this.setDrawState('selecting');
            } else if (this.editorSettings.drawMode === 'move') {
                this.setDrawState('moving');
            } else {
                this.setDrawState('drawing');
                this.emit('draw_start');
            }
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

            startDrawing();

            this.unhighlightPixel();

            activatePixelAtCursor(e);
            this.addEvent(this.$el.ownerDocument, 'mousemove', onMouseMove);
        };

        const onMouseUp = () => {
            this.$el.removeEventListener('mousemove', onMouseMove);
            this.$el.removeEventListener('touchmove', onTouchMove);
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
                case 'moving':
                    this.setDrawState('selected');
                    break;
                default:
                    nope(this.drawContext.state);
                    break;
            }

            this.drawContext.mouseDownOrigin = null;
            mouseDownOrigin = null;
            lastDrawnPixel = null;
            this.finalizeTransientState();
        };

        const onHover = (e: MouseEvent): void => {
            if (this.drawContext.state !== 'idle' && this.drawContext.state !== 'selected') {
                return;
            }

            this.unhighlightPixel();

            if (e.shiftKey) {
                return;
            }

            if (this.editorSettings.drawMode === 'move') {
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

        this.addEvent(this.$el, 'touchstart', onTouchStart);
        this.addEvent(this.$el, 'touchmove', onTouchMove);
        this.addEvent(this.$el.ownerDocument, 'touchend', onMouseUp);
    }

    private addEvent(target: EventTarget, name: string, listener: (...args: any[]) => void): void {
        target.addEventListener(name, listener);
        this.eventMap.push([ target, name, listener ]);
    }

    public copyImageToCanvas($canvas: HTMLCanvasElement, maxSize: number = Infinity): void {
        const width = this.displayWidth;
        const height = this.displayHeight;
        const maxDimension = Math.max(width, height);
        const scale = maxDimension <= maxSize ? 1 : maxSize / maxDimension;

        $canvas.width = width * scale;
        $canvas.height = height * scale;

        const ctx = get2dContext($canvas);
        this.bgCanvas.drawImageOnto(ctx, 0, 0, $canvas.width, $canvas.height);
        this.drawImageOnto(ctx, 0, 0, $canvas.width, $canvas.height);
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
                this.drawContext.movedData = [];
                this.drawContext.moveOffset = null;
                this.drawContext.mouseDownOrigin = null;
                this.drawContext.eraseOnMove = true;
                break;
            case 'moving':
                break;
            case 'selected':
                // NOTE: do not reset movedData here, we want to be able to move the same
                // block of data again
                this.drawContext.moveOffset = null;
                this.drawContext.mouseDownOrigin = null;
                break;
            default:
                nope(this.drawContext.state);
                throw new Error(`unknown draw state "${this.drawContext.state}"`);
        }

        this.emit('draw_state_change', this.drawContext);
    }

    public resetDrawContext(): void {
        this.logger.debug('resetting draw context');
        if (this.drawContext.movedData.length) {
            this.finalizeTransientState(() => true);
        }

        this.setDrawState('idle');
        this.transientState = [];
        this.transientCanvas.clearAll();
    }

    private finalizeTransientState(predicate?: () => boolean): void {
        if (!this.transientState.length) {
            return;
        }

        let drawn = false;

        predicate = predicate ||
            (() => this.drawContext.state !== 'selecting' && this.drawContext.state !== 'selected');

        if (!predicate()) {
            return;
        }

        this.logger.debug(`committing transient state (${this.transientState.length} pixels)`);
        while (this.transientState.length) {
            const data = this.transientState.pop()!;
            if (this.pixelData[data.coordinate.y]?.[data.coordinate.x]) {
                // in some cases the transient data is dereferenced, so we must explicitly set the pixel
                // into the canonical pixelData array
                this.pixelData[data.coordinate.y]![data.coordinate.x] = data.pixel;
            } else {
                this.logger.warn(`transient pixel does not exist in pixel data at ${data.coordinate.x},${data.coordinate.y}`);
            }

            drawn = this.drawPixelFromRowAndCol(data.coordinate, data.pixel, {
                behavior: 'internal',
                emit: false,
                color: data.color,
                allowErasure: true,
            }) || drawn;
        }
        this.clearTransientRect();

        if (drawn) {
            this.emit('pixel_draw_aggregate', { behavior: 'user' });
        }
    }

    public getDrawState(): PixelCanvasDrawState {
        return this.drawContext.state;
    }

    public setSelection(rect: Rect, moveData?: PixelInfo[][] | null, eraseOnMove = true): void {
        this.logger.info(`setting selection to ${rect.width}x${rect.height} at ${rect.x},${rect.y}`);
        this.transientState = [];
        this.drawContext.selection = rect;
        this.drawContext.eraseOnMove = eraseOnMove;

        if (moveData) {
            this.drawContext.movedData = moveData;
            this.drawContext.movedData.forEach((row, y) => {
                row.forEach((pixel, x) => {
                    this.transientState.push({
                        pixel,
                        color: pixel.modeColorIndex,
                        coordinate: {
                            x: rect.x + x,
                            y: rect.y + y,
                        },
                    });
                });
            });
        }

        this.setDrawState('selected');
        this.renderSelection();
    }

    /**
     * Gets the dereferenced pixel data for the current selection
     */
    public getSelectionPixelData(): PixelInfo[][] {
        if (!this.drawContext.selection) {
            return [];
        }

        // if the selection is being moved around, use that instead of whatever
        // is currently selected
        if (this.drawContext.movedData.length) {
            return this.drawContext.movedData;
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

    private execAgainstSelectedData(callback: (rect: Rect, pixelData: PixelInfo[][], offset: Coordinate) => void): void {
        if (!this.drawContext.selection) {
            return;
        }

        const isMoving = this.isMoving();
        const pixelData = isMoving ? this.drawContext.movedData : this.pixelData;
        const rect = isMoving ?
            { x: 0, y: 0, width: pixelData[0]!.length, height: pixelData.length } :
            this.drawContext.selection;
        const offset: Coordinate = isMoving ? this.drawContext.selection : {
            x: 0,
            y: 0,
        };

        if (!rect.width || !rect.height) {
            return;
        }

        callback(rect, pixelData, offset);
    }

    /**
     * Erases data outlined by the current selection and deletes the data currently being moved
     */
    public eraseCurrentSelection(behavior: PixelDrawingBehavior = 'user'): void {
        this.execAgainstSelectedData((rect, pixelData, offset) => {
            let eraseCount = 0;
            for (let y = rect.y; y < rect.y + rect.height; y++) {
                const row = pixelData[y];
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

            const isMoving = this.isMoving();

            this.clearRect(
                (rect.x + offset.x) * this.internalPixelWidth,
                (rect.y + offset.y) * this.internalPixelHeight,
                rect.width * this.internalPixelWidth,
                rect.height * this.internalPixelHeight,
                isMoving ? this.transientCanvas.getRenderingContext() : this.ctx,
            );

            if (isMoving) {
                this.clearRect(
                    (rect.x + offset.x) * this.internalPixelWidth,
                    (rect.y + offset.y) * this.internalPixelHeight,
                    rect.width * this.internalPixelWidth,
                    rect.height * this.internalPixelHeight,
                    this.ctx,
                );

                // we cleared the transient data (including the selection rect), so we must re-render the
                // selection rect on the transient canvas.
                this.renderSelectionRect();
            }

            const totalCount = rect.width * rect.height;
            this.logger.debug(`erased ${eraseCount}/${totalCount} pixel${eraseCount === 1 ? '' : 's'} from selection`);

            this.emit('pixel_draw_aggregate', { behavior });
        });
    }

    public flipCurrentSelection(dir: 'horizontal' | 'vertical'): void {
        this.execAgainstSelectedData((rect, pixelData, offset) => {
            if ((rect.width === 1 && dir === 'horizontal') || (rect.height === 1 && dir === 'vertical')) {
                // can't flip a single unit
                return;
            }

            const isMoving = this.isMoving();
            const ctx = isMoving ? this.transientCanvas.getRenderingContext() : this.ctx;

            // allowErasure=false because we clear the rect first. this is possible because we are processing
            // the middle row/column (even though we don't need to). that in turn is necessary so that we
            // can flip transient data (i.e. moved data). since both the transient data and the selection rect
            // are rendered to the same canvas, we need to re-render the entire selection area.
            // NOTE: allowErasure=false only exists for performance reasons, it's not actually necessary.
            this.clearRect(
                rect.x * this.internalPixelWidth,
                rect.y * this.internalPixelHeight,
                rect.width * this.internalPixelWidth,
                rect.height * this.internalPixelHeight,
                ctx,
            );
            const drawOptions: Pick<DrawPixelOptions, 'emit' | 'behavior' | 'immutable' | 'allowErasure' | 'ctx'> = {
                emit: false,
                behavior: 'internal',
                immutable: true,
                allowErasure: false,
                ctx,
            };

            this.transientState = [];

            const flipped: Record<`${number},${number}`, number> = {};
            if (dir === 'horizontal') {
                const colors = this.getColors();
                const mapping = this.displayMode.getReflectedColorMapping(colors);
                for (let y = rect.y; y < rect.y + rect.height; y++) {
                    const row = pixelData[y];
                    if (!row) {
                        break;
                    }

                    for (let x = 0; x < Math.ceil(rect.width / 2); x++) {
                        const leftX = rect.x + x;
                        const rightX = rect.x + rect.width - 1 - x;
                        const leftValue = row[leftX];
                        const rightValue = row[rightX];
                        if (!leftValue || !rightValue) {
                            break;
                        }

                        row[leftX] = {
                            modeColorIndex: mapping[rightValue.modeColorIndex || 0] as any,
                        };
                        row[rightX] = {
                            modeColorIndex: mapping[leftValue.modeColorIndex || 0] as any,
                        };
                        flipped[`${x},${y}`] = leftX === rightX ? 0 : 2;

                        this.drawPixelFromRowAndCol({ x: leftX + offset.x, y: y + offset.y }, row[leftX], {
                            ...drawOptions,
                            color: row[leftX].modeColorIndex,
                        });
                        this.drawPixelFromRowAndCol({ x: rightX + offset.x, y: y + offset.y }, row[rightX], {
                            ...drawOptions,
                            color: row[rightX].modeColorIndex,
                        });

                        if (isMoving) {
                            this.transientState.push({
                                color: row[leftX].modeColorIndex,
                                coordinate: {
                                    x: leftX + offset.x,
                                    y: y + offset.y,
                                },
                                pixel: row[leftX],
                            });
                            this.transientState.push({
                                color: row[rightX].modeColorIndex,
                                coordinate: {
                                    x: rightX + offset.x,
                                    y: y + offset.y,
                                },
                                pixel: row[rightX],
                            });
                        }
                    }
                }
            } else {
                for (let y = 0; y < Math.ceil(rect.height / 2); y++) {
                    const topY = rect.y + y;
                    const botY = rect.y + rect.height - 1 - y;
                    const topRow = pixelData[topY];
                    const bottomRow = pixelData[botY];
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
                        flipped[`${x},${y}`] = topY === botY ? 0 : 2;

                        this.drawPixelFromRowAndCol({ x: x + offset.x, y: topY + offset.y }, bottomValue, {
                            ...drawOptions,
                            color: bottomValue.modeColorIndex,
                        });
                        this.drawPixelFromRowAndCol({ x: x + offset.x, y: botY + offset.y }, topValue, {
                            ...drawOptions,
                            color: topValue.modeColorIndex,
                        });

                        if (isMoving) {
                            this.transientState.push({
                                color: bottomValue.modeColorIndex,
                                coordinate: {
                                    x: x + offset.x,
                                    y: topY + offset.y,
                                },
                                pixel: bottomValue,
                            });
                            this.transientState.push({
                                color: topValue.modeColorIndex,
                                coordinate: {
                                    x: x + offset.x,
                                    y: botY + offset.y,
                                },
                                pixel: topValue,
                            });
                        }
                    }
                }
            }

            const flipCount = Object.values(flipped).reduce((sum, count) => sum + count, 0);
            const totalCount = rect.width * rect.height;
            this.logger.debug(`${dir}ly flipped ${flipCount}/${totalCount} pixel${flipCount === 1 ? '' : 's'} from selection`);

            if (flipCount) {
                if (isMoving) {
                    // this is necessary because we are rendering to the transient canvas, which means
                    // the selection rect gets blown away by the actual pixel data we are moving around.
                    // for a normal non-moved selection, the transient canvas isn't touched because
                    // we write the pixel data directly to the main editor canvas.

                    // NOTE: we are not calling renderSelection() because we just rendered all the data
                    // a couple lines above this one, all we need to do is re-render the selection rectangle,
                    // not the actual moved data again.
                    this.renderSelectionRect();
                }
                this.emit('pixel_draw_aggregate', { behavior: 'user' });
            }
        });
    }

    public clear(): void {
        this.logger.debug(`clearing canvas`);
        this.clearRect(0, 0, this.internalWidth, this.internalHeight);
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
        this.transientCanvas.clearAll();
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
                const drawn = this.drawPixelFromRowAndCol({ x: col, y: row }, pixelInfo, {
                    behavior: 'internal',
                    emit: false,
                    color: pixelInfo.modeColorIndex,
                    allowErasure: false,
                });
                if (drawn) {
                    pixelsDrawn += (pixelInfo.modeColorIndex !== null ? 1 : 0);
                }
            }
        }

        this.logger.debug(`drew ${pixelsDrawn}/${totalPixels} pixel${pixelsDrawn === 1 ? '' : 's'}`);

        this.renderGrid();
        this.renderSelection();
        this.logger.debug(`rendering complete in ${Date.now() - start}ms`);
        this.emit('pixel_draw_aggregate', { behavior: 'internal' });
    }

    public renderBg(): void {
        if (this.destroyed) {
            return;
        }

        this.bgCanvas.render();
    }

    public renderGrid(): void {
        if (this.destroyed) {
            return;
        }

        this.gridCanvas.render();
    }

    public renderSelection(onRenderedMovedPixel?: (pixel: PixelInfo, coordinate: Coordinate) => void): void {
        const { selection, state } = this.drawContext;
        if (!selection || (state !== 'selected' && state !== 'selecting' && state !== 'moving')) {
            return;
        }

        this.clearTransientRect();
        this.renderMovedData(onRenderedMovedPixel);
        this.renderSelectionRect();
    }

    private renderSelectionRect(): void {
        const { selection } = this.drawContext;
        if (!selection) {
            return;
        }

        const x = selection.x * this.internalPixelWidth;
        const y = selection.y * this.internalPixelHeight;
        const w = selection.width * this.internalPixelWidth;
        const h = selection.height * this.internalPixelHeight;
        this.transientCanvas.drawHoverStyleRect(x, y, w, h, 12);
    }

    private renderMovedData(callback?: (pixel: PixelInfo, coordinate: Coordinate) => void): void {
        const { selection, movedData } = this.drawContext;
        if (!selection) {
            return;
        }

        movedData.forEach((pixelRow, i) => {
            const row = i + selection.y;
            pixelRow.forEach((pixel, j) => {
                const col = j + selection.x;
                const drawn = this.drawPixelFromRowAndCol({ x: col, y: row }, pixel, {
                    behavior: 'internal',
                    emit: false,
                    ctx: this.transientCanvas.getRenderingContext(),
                    immutable: true,
                    color: pixel.modeColorIndex,
                    allowErasure: true,
                });

                if (callback && drawn) {
                    callback(pixel, { x: col, y: row });
                }
            })
        });
    }

    private getColorForModeIndex(index: DisplayModeColorIndex): DisplayModeColorValue | null {
        if (index === null) {
            return null;
        }
        const paletteSet = this.paletteSet;
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
        const shouldErase = options.allowErasure; // isUserAction || options.forceErase === true;

        // if it's the user actually drawing something, we use the current palette/color, otherwise,
        // it's just an internal render, and we use the pixel's current palette/color
        const newColor = options.color;

        // NOTE: all the "if (shouldErase)" stuff is for performance reasons, apparently
        // calling a function that does the same conditional is significantly slower than just
        // doing it inline. and since this is called in a loop during render() it gets called
        // a lot.
        // basically we only need to manually clear a pixel if it's initiated by the user
        // i.e. a drawing action, regular renders do a full clear of the canvas before
        // drawing so subsequent clearRect() calls aren't needed.

        const { x: col, y: row } = pixelRowAndCol;
        const canvasCoordinate = this.convertPixelToCanvasCoordinate(pixelRowAndCol);

        if (newColor === null) {
            if (shouldErase) {
                this.clearRect(
                    canvasCoordinate.x,
                    canvasCoordinate.y,
                    this.internalPixelWidth,
                    this.internalPixelHeight,
                    ctx,
                );
            }
        } else {
            const colorValue = this.getColorForModeIndex(newColor);
            if (!colorValue) {
                this.logger.error(`color[${newColor}] not found in display mode ${this.displayMode.name}`);
                if (shouldErase) {
                    this.clearRect(
                        canvasCoordinate.x,
                        canvasCoordinate.y,
                        this.internalPixelWidth,
                        this.internalPixelHeight,
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

                    const width = this.internalPixelWidth / partsPerPixel;
                    const fudge = i * width;
                    const x = canvasCoordinate.x + fudge;
                    if (color.value === 'background') {
                        ctx.fillStyle = this.backgroundColor.hex;
                        ctx.fillRect(x, canvasCoordinate.y, width, this.internalPixelHeight);
                    } else if (color.value === 'transparent') {
                        if (shouldErase) {
                            this.clearRect(x, canvasCoordinate.y, width, this.internalPixelHeight, ctx);
                        }
                    } else {
                        ctx.fillStyle = color.value.palette.getColorAt(color.value.index).hex;
                        ctx.fillRect(x, canvasCoordinate.y, width, this.internalPixelHeight);
                    }
                }
            }
        }

        // in some cases (e.g. drawing to the transient canvas) we don't want to update the
        // pixel with the new color: we keep it as is despite drawing something different
        // to the canvas. in many (all?) cases we pass the pixel around by reference so that
        // it's easier to mutate.
        if (!immutable) {
            pixel.modeColorIndex = newColor;
        }

        // important to not emit for internal drawing actions for performance reasons
        if (options.emit) {
            this.emit('pixel_draw', { pixel, row, col, behavior });
        }

        return true;
    }

    public static generateHash(data: PixelInfo[][]): string {
        return '\n' + data
            .map(row => row.map(data => data.modeColorIndex === null ? '' : data.modeColorIndex))
            .join('\n');
    }

    public static generateHashWithDimensions(data: PixelInfo[][], dimensions: Dimensions): string {
        return `w:${dimensions.width},h:${dimensions.height}` + '\n' + this.generateHash(data);
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

        this.hoverCanvas.render({ x: col, y: row });
        this.emit('pixel_hover', pixelRowAndCol, pixel);

        return true;
    }

    public unhighlightPixel(): boolean {
        if (this.destroyed) {
            return false;
        }

        this.hoverCanvas.render({ x: 0, y: 0, erase: true });

        return true;
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
            this.settings.width = width;
            changed = true;
        }
        if (height !== null && this.height !== height) {
            this.settings.height = height;
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
            this.settings.pixelWidth = width;
            changed = true;
        }
        if (height !== null && this.pixelHeight !== height) {
            this.settings.pixelHeight = height;
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

    public getCurrentSelection(): Readonly<PixelCanvasDrawStateContext['selection']> {
        return this.drawContext.selection;
    }

    public isMoving(): boolean {
        return !!this.drawContext.selection && this.drawContext.movedData.length > 0;
    }

    public get asmLabel(): string {
        return this.name
            .split(' ')
            .map(word => (word[0]?.toUpperCase() + word.slice(1)).replace(/\W/ig, '') || '')
            .filter(Boolean)
            .join('');
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

        const paletteSet = this.paletteSet;
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
            paletteSet: this.paletteSet,
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

        let palette: ColorPalette | null = null;
        let paletteSet: ColorPaletteSet | null = null;
        for (let i = 0; i < paletteSets.length; i++) {
            palette = paletteSets[i]?.findPaletteById(serialized.paletteId) || null;
            if (palette) {
                paletteSet = paletteSets[i]!;
                break;
            }
        }

        if (!palette) {
            paletteSet = paletteSets[0] || null;
            palette = paletteSet?.getPalettes()[0] || null;
        }

        if (!palette || !paletteSet) {
            throw new Error(`Could not create color palette while deserializing PixelCanvas`);
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
            palette,
            paletteSet,
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
