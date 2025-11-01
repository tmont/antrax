import { type ColorIndex, ColorPalette } from './ColorPalette.ts';
import type { ColorPaletteSet } from './ColorPaletteSet.ts';
import type { Atari7800Color } from './colors.ts';
import { EventEmitter } from './EventEmitter.ts';
import { ObjectGroup } from './ObjectGroup.ts';
import { type CanvasOptions, PixelCanvas, type PixelDrawingEvent } from './PixelCanvas.ts';
import { findElement, findOrDie, parseTemplate } from './utils.ts';

// https://stackoverflow.com/a/13139830
const emptyGif = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

const objectItemTmpl = `
<div class="project-item">
    <div class="project-list-item">
        <img alt="" class="object-thumbnail" src="${emptyGif}" />
        <a href="#" class="item-name clamp-1"></a>
        <div class="item-controls">
            <button type="button" class="btn btn-sm btn-success add-object-btn" title="Clone object in same group">
                <i class="fa-solid fa-clone"></i>
            </button>
            <button type="button" class="btn btn-sm btn-danger del-object-btn" title="Delete object">
                <i class="fa-solid fa-trash"></i>
            </button>
        </div>
    </div>
    <div class="object-info">
        <span class="canvas-size"></span>
        <span>&middot;</span>
        <div><span class="pixel-size"></span>px</div>
        <span>&middot;</span>
        <div class="palette-set-name clamp-1"></div>
    </div>
</div>
`;

const objectGroupTmpl = `
<div class="project-item-group">
    <header class="group-name clamp-1"></header>
    <div class="indented-list group-items"></div>
</div>
`;

export interface ProjectOptions extends Pick<CanvasOptions, 'mountEl' | 'showGrid' | 'pixelWidth' | 'pixelHeight' | 'zoomLevel'> {
    canvasMountEl: HTMLElement;
    name: string;
    canvasWidth?: number;
    canvasHeight?: number;
    paletteSet: ColorPaletteSet;
    palette: ColorPalette;
    colorIndex: ColorIndex;
}

export type ProjectEventMap = {
    canvas_activate: [ PixelCanvas | null ];
    pixel_highlight: [ PixelDrawingEvent ];
    pixel_draw: [ PixelDrawingEvent ];
};

export class Project extends EventEmitter<ProjectEventMap> {
    private readonly canvases: PixelCanvas[] = [];
    private activeCanvas: PixelCanvas | null = null;
    private showGrid = false;
    private zoomLevel: number;
    private pixelWidth: number;
    private pixelHeight: number;
    private canvasWidth: number;
    private canvasHeight: number;
    public name: string;
    private readonly $container: HTMLElement;
    private readonly $canvasContainer: HTMLElement;
    private initialized = false;

    private activeColorPaletteSet: ColorPaletteSet;
    private activeColorPalette: ColorPalette;
    private activeColorIndex: ColorIndex;

    public constructor(options: ProjectOptions) {
        super();
        this.name = options.name;
        this.$container = options.mountEl;
        this.$canvasContainer = options.canvasMountEl;
        this.showGrid = typeof options.showGrid === 'boolean' ? options.showGrid : false;
        this.zoomLevel = options.zoomLevel || 3;
        this.pixelWidth = options.pixelWidth || 16;
        this.pixelHeight = options.pixelHeight || 7;
        this.canvasWidth = options.canvasWidth || 30;
        this.canvasHeight = options.canvasWidth || 30;
        this.activeColorPaletteSet = options.paletteSet;
        this.activeColorPalette = options.palette;
        this.activeColorIndex = options.colorIndex;
    }

    public init(): void {
        if (this.initialized) {
            return;
        }

        const newObjBtn = findOrDie(this.$container, '.new-object-btn', node => node instanceof HTMLElement);

        newObjBtn.addEventListener('click', () => {
            this.addObject({
                mountEl: this.$canvasContainer,
                editable: true,
                width: this.canvasWidth,
                height: this.canvasHeight,
                pixelHeight: this.pixelHeight,
                pixelWidth: this.pixelWidth,
                zoomLevel: this.zoomLevel,
                showGrid: this.showGrid,
                group: new ObjectGroup({
                    paletteSet: this.activeColorPaletteSet,
                    palette: this.activeColorPalette,
                    colorIndex: this.activeColorIndex,
                    backgroundColor: this.activeColorPaletteSet.getBackgroundColor(),
                }),
            });
        });

        this.update();
        this.activeColorPalette.setActiveState(true, this.activeColorIndex);

        this.initialized = true;
    }

    public activateCanvas(canvas: PixelCanvas | null): void {
        if (this.activeCanvas) {
            this.activeCanvas.hide();
        }

        this.activeCanvas = canvas;
        this.activeCanvas?.show();

        this.emit('canvas_activate', this.activeCanvas);

        const items = this.$container.querySelectorAll(`.project-item`);
        items.forEach((el) => {
            el.classList.remove('active');
            if (el.getAttribute('data-canvas-id') === canvas?.id.toString()) {
                el.classList.add('active');
            }
        });

        this.updateObjectInfo();
    }

    private findActiveProjectItem(): HTMLElement | null {
        if (!this.activeCanvas) {
            return null;
        }

        return findElement(this.$container, `.project-item[data-canvas-id="${this.activeCanvas.id}"]`);
    }

    public addObject(options: CanvasOptions): PixelCanvas {
        const canvas = new PixelCanvas(options);
        canvas.on('pixel_highlight', (...args) => {
            this.emit('pixel_highlight', ...args);
        });
        canvas.on('pixel_draw', (...args) => {
            this.updateActiveThumbnail();
            this.emit('pixel_draw', ...args);
        });
        this.canvases.push(canvas);

        const el = parseTemplate(objectItemTmpl);
        const parent = this.$container.querySelector(`.project-objects`);
        if (!parent) {
            throw new Error('.project-objects container element not found');
        }

        el.querySelector('.item-name')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.activateCanvas(canvas);
        });

        const doc = this.$container.ownerDocument;
        el.querySelector('.item-name')?.appendChild(doc.createTextNode(canvas.name));
        el.setAttribute('data-canvas-id', canvas.id.toString());

        let group = parent.querySelector(`.project-item-group[data-group-id="${canvas.group.id}"]`);
        if (!group) {
           group = parseTemplate(objectGroupTmpl);
           group.setAttribute('data-group-id', canvas.group.id);
           group.querySelector('.group-name')?.appendChild(doc.createTextNode(canvas.group.name));
           parent.appendChild(group);
        }

        group.querySelector('.group-items')?.appendChild(el);
        el.querySelector('.add-object-btn')?.addEventListener('click', () => {
            const { width: pixelWidth, height: pixelHeight } = canvas.getPixelDimensions();
            const { width, height } = canvas.getDimensions();

            this.addObject({
                group: canvas.group,
                mountEl: canvas.getContainer(),
                pixelWidth: pixelWidth,
                pixelHeight: pixelHeight,
                width: width,
                height: height,
                pixelData: canvas.clonePixelData(),
                zoomLevel: canvas.getZoomLevel(),
                editable: true,
                showGrid: canvas.getShowGrid(),
            });
        });

        el.querySelector('.del-object-btn')?.addEventListener('click', () => {
            this.removeObject(canvas);
        });

        canvas.render();

        this.activateCanvas(canvas);
        return canvas;
    }

    public removeObject(canvas: PixelCanvas): void {
        const index = this.canvases.indexOf(canvas);
        if (index !== -1) {
            this.canvases.splice(index, 1);
        }

        const el = this.$container.querySelector(`.project-objects [data-canvas-id="${canvas.id}"]`);
        if (el) {
            el.remove();
        }

        if (this.activeCanvas === canvas) {
            this.activeCanvas.destroy();
            this.activeCanvas = null;
            this.activateCanvas(null);
        }

        if (!this.getObjectsInGroup(canvas.group).length) {
            // remove group if it has no objects
            this.$container.querySelector(`.project-item-group[data-group-id="${canvas.group.id}"]`)?.remove();
        }
    }

    public update(): void {
        const nameEl = this.$container.querySelector('.project-name');
        if (!nameEl) {
            throw new Error('.project-name element not found');
        }

        nameEl.innerHTML = '';
        nameEl.appendChild(this.$container.ownerDocument.createTextNode(this.name));
    }

    public updateObjectInfo(): void {
        const $el = this.findActiveProjectItem();
        if (!$el || !this.activeCanvas) {
            return;
        }

        this.updateActiveThumbnail();

        const { width, height } = this.activeCanvas.getDimensions();
        const { width: pixelWidth, height: pixelHeight } = this.activeCanvas.getPixelDimensions();

        findElement($el, '.canvas-size').innerText = `${width}×${height}`;
        findElement($el, '.pixel-size').innerText = `${pixelWidth}×${pixelHeight}`;
        findElement($el, '.palette-set-name').innerText = this.activeCanvas.group.getPaletteSet().getName();
    }

    public updateActiveThumbnail(): void {
        if (this.activeCanvas) {
            this.updateThumbnailForCanvas(this.activeCanvas);
        }
    }

    private updateThumbnailForCanvas(canvas: PixelCanvas): void {
        canvas.generateDataURL((url) => {
            const selector = `[data-canvas-id="${canvas.id}"] .object-thumbnail`;
            const thumbnail = findOrDie(this.$container, selector, node => node instanceof HTMLImageElement);
            thumbnail.src = url || emptyGif;
        });
    }

    /**
     * This is explicit because inactive canvases aren't shown, but the thumbnails are,
     * so if something changes (like a palette color change) then we might need to update
     * thumbnails other than the active one.
     */
    public updateAllThumbnails(): void {
        this.canvases.forEach(canvas => this.updateThumbnailForCanvas(canvas));
    }

    public onResize(): void {
        // TODO not needed any more since it's absolutely positioned?
        this.activeCanvas?.setCanvasPosition();
    }

    public zoomTo(zoomLevel: number): void {
        this.zoomLevel = zoomLevel;
        this.canvases.forEach(canvas => canvas.setZoomLevel(zoomLevel));
    }

    public setShowGrid(showGrid: boolean): void {
        this.showGrid = showGrid;
        this.canvases.forEach(canvas => canvas.setShowGrid(showGrid));
    }

    public setPixelDimensions(width: number | null, height: number | null): void {
        if (width) {
            this.pixelWidth = width;
        }
        if (height) {
            this.pixelHeight = height;
        }
        this.activeCanvas?.setPixelDimensions(width, height);
        this.updateObjectInfo();
    }

    public setCanvasDimensions(width: number | null, height: number | null): void {
        if (width) {
            this.canvasWidth = width;
        }
        if (height) {
            this.canvasHeight = height;
        }
        this.activeCanvas?.setDimensions(width, height);
        this.updateObjectInfo();
    }

    private getObjectsInGroup(group: ObjectGroup): PixelCanvas[] {
        return this.canvases.filter(canvas => canvas.group === group);
    }

    public setActiveColor(
        paletteSet: ColorPaletteSet,
        palette: ColorPalette,
        color: Atari7800Color,
        index: ColorIndex,
    ): void {
        this.activeColorPaletteSet = paletteSet;
        this.activeColorPalette = palette;
        this.activeColorIndex = index;

        // TODO this should probably only be for groups with the active palette set...
        this.canvases.forEach(canvas => canvas.group.setActiveColor(paletteSet, palette, index));
    }

    public setBackgroundColor(color: Atari7800Color): void {
        // TODO this should probably only be for groups with the active palette set...
        this.canvases.forEach(canvas => canvas.render());
        this.updateAllThumbnails();
    }

    public updatePaletteColor(palette: ColorPalette, colorIndex: ColorIndex): void {
        this.canvases.forEach(canvas => canvas.render());
        this.updateAllThumbnails();
    }
}
