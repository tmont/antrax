import type { ColorPalette } from './ColorPalette.ts';
import type { ColorPaletteSet } from './ColorPaletteSet.ts';
import DisplayMode from './DisplayMode.ts';
import type { EditorSettings } from './Editor.ts';
import { EventEmitter } from './EventEmitter.ts';
import { Logger } from './Logger';
import { ObjectGroup, type ObjectGroupSerialized } from './ObjectGroup.ts';
import {
    type Coordinate,
    type Dimensions,
    type DisplayModeColorIndex,
    type DisplayModeColorValueSerialized,
    type DisplayModeName,
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
    clear: [];
    reset: [];
    draw_start: [];
    pixel_dimensions_change: [];
    canvas_dimensions_change: [];
    display_mode_change: [];
    palette_change: [];
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
    private ctx: CanvasRenderingContext2D;
    private readonly logger: Logger;
    private readonly eventMap: Record<string, Array<(...x: any[]) => void>> = {};
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

    private readonly $el: HTMLCanvasElement;
    private readonly $gridEl: HTMLCanvasElement;
    private readonly $hoverEl: HTMLCanvasElement;

    private drawState: PixelCanvasDrawState = 'idle';

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

        this.setCanvasDimensions();
        this.enable();
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

    public getName(): string {
        return this.name;
    }

    public getActiveColor(): DisplayModeColorIndex {
        return this.activeColor;
    }

    public setActiveColor(modeColorIndex: DisplayModeColorIndex): void {
        this.activeColor = modeColorIndex;
        this.logger.debug(`active color set`, modeColorIndex);
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

    private fillPixelDataArray(reset = false): void {
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

        this.disable();

        this.$el.style.display = 'none';
        this.$hoverEl.style.display = 'none';
        this.$gridEl.style.display = 'none';
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
    }

    public enable(): void {
        if (this.destroyed) {
            return;
        }

        const activatePixelAtCursor = (e: MouseEvent): void => {
            const { clientX, clientY, ctrlKey: erasing } = e;

            const { top: offsetTop, left: offsetLeft } = this.$el.getBoundingClientRect();

            const trueX = clientX + document.documentElement.scrollLeft - offsetLeft;
            const trueY = clientY + document.documentElement.scrollTop - offsetTop;

            const pixelData = this.getPixelAt({ x: trueX, y: trueY });
            if (pixelData.pixel) {
                this.drawPixelFromRowAndCol({ x: pixelData.col, y: pixelData.row }, pixelData.pixel, 'user', erasing);
            }
        };

        const onMouseMove = (e: MouseEvent): void => {
            activatePixelAtCursor(e);
        };

        const onMouseDown = (e: MouseEvent) => {
            if (this.drawState !== 'idle') {
                return;
            }

            if (e.shiftKey) {
                return;
            }

            this.setDrawState('drawing');
            this.emit('draw_start');
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
            if (pixelData.pixel) {
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
    }

    private generateURLTimeoutId: number | null = null;

    public generateDataURL(callback: (url: string | null) => void): void {
        if (this.generateURLTimeoutId) {
            window.clearTimeout(this.generateURLTimeoutId);
            this.generateURLTimeoutId = null;
        }

        this.generateURLTimeoutId = window.setTimeout(() => {
            this.$el.toBlob((blob) => {
                if (!blob) {
                    callback(null);
                    return;
                }

                this.logger.debug('generated blob');
                callback(URL.createObjectURL(blob));
            }, 'image/png');
        }, 50);
    }

    private setDrawState(newState: PixelCanvasDrawState): void {
        this.logger.info(`setting drawState to ${newState}`);
        this.drawState = newState;
    }

    public clear(): void {
        this.logger.info(`clearing canvas with color ${this.group.getBackgroundColor().hex}`);
        this.clearRect(0, 0, this.displayWidth, this.displayHeight);
        this.emit('clear');
    }

    public reset(): void {
        this.clear();
        this.fillPixelDataArray(true);
        this.emit('reset');
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

        this.logger.debug('rendering');
        this.clear();

        let pixelsDrawn = 0;
        let totalPixels = 0;
        for (let row = 0; row < this.pixelData.length; row++) {
            const pixelRow = this.pixelData[row]!;
            for (let col = 0; col < pixelRow.length; col++) {
                totalPixels++;
                const pixelInfo = pixelRow[col]!;
                if (this.drawPixelFromRowAndCol({ x: col, y: row }, pixelInfo, 'internal')) {
                    pixelsDrawn += (pixelInfo.modeColorIndex !== null ? 1 : 0);
                }
            }
        }

        this.logger.debug(`drew ${pixelsDrawn}/${totalPixels} pixel${pixelsDrawn === 1 ? '' : 's'}`);

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

    public drawPixelFromRowAndCol(
        pixelRowAndCol: Coordinate,
        pixel: PixelInfo,
        behavior: PixelDrawingBehavior,
        erasing = false,
    ): boolean {
        if (this.destroyed) {
            return false;
        }

        // if it's the user actually drawing something, we use the current palette/color, otherwise,
        // it's just an internal render, and we use the pixel's current palette/color
        if (behavior === 'user') {
            pixel.modeColorIndex = erasing ? null : this.activeColor;
        }

        const { x: col, y: row } = pixelRowAndCol;
        const absoluteCoordinate = this.convertPixelToAbsoluteCoordinate(pixelRowAndCol);

        if (pixel.modeColorIndex === null) {
            this.clearRect(absoluteCoordinate.x, absoluteCoordinate.y, this.displayPixelWidth, this.displayPixelHeight);
        } else {

            const colorValue = this.displayMode.getColorAt(this.editorSettings.activeColorPaletteSet, this.palette, pixel.modeColorIndex);
            if (!colorValue) {
                this.logger.error(`color[${pixel.modeColorIndex}] not found in display mode ${this.displayMode.name}`);
                this.clearRect(absoluteCoordinate.x, absoluteCoordinate.y, this.displayPixelWidth, this.displayPixelHeight);
            } else {
                // not using slice() since it's probably more efficient to not copy the array since this is
                // called in a loop. but ain't nobody got time for benchmarking, so maybe it wouldn't even
                // matter...
                const partsPerPixel = Math.min(colorValue.length, this.displayMode.partsPerPixel);
                for (let i = 0; i < partsPerPixel; i++) {
                    const color = colorValue[i];
                    if (!color) {
                        break;
                    }

                    const width = this.displayPixelWidth / partsPerPixel;
                    const fudge = i * width;
                    const x = absoluteCoordinate.x + fudge;
                    if (color.value === 'background' || color.value === 'transparent') {
                        this.clearRect(x, absoluteCoordinate.y, width, this.displayPixelHeight);
                    } else {
                        this.ctx.fillStyle = color.value.palette.getColorAt(color.value.index).hex;
                        this.ctx.fillRect(x, absoluteCoordinate.y, width, this.displayPixelHeight);
                    }
                }
            }
        }

        this.emit('pixel_draw', { pixel, row, col, behavior });

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

    private getPixelAt(screenLocation: Coordinate): { row: number; col: number; pixel: PixelInfo | null } {
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
        // if (zoomLevel <= 0 || zoomLevel > 10) {
        //     return;
        // }

        this.setCanvasDimensions();
        if (render) {
            this.render();
        }
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
        this.emit('canvas_dimensions_change');
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
        this.emit('pixel_dimensions_change');
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
