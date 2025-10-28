import { EventEmitter } from './EventEmitter.ts';
import type { ObjectGroup } from './ObjectGroup.ts';
import { type CanvasOptions, PixelCanvas, type PixelDrawingEvent } from './PixelCanvas.ts';
import { findOrDie, parseTemplate } from './utils.ts';

const objectItemTmpl = `
<div class="project-item">
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
}

export type ProjectEventMap = {
    canvas_activate: [ PixelCanvas ];
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
                pixelData: [
                    [ { color: 'red', }, { color: 'blue' }, { color: 'green' } ],
                    [ { color: 'black', }, { color: 'yellow' }, { color: 'magenta' } ],
                    [ { color: 'orange', }, { color: 'purple' }, { color: 'cyan' } ],
                ],
            });
        });

        this.update();

        this.initialized = true;
    }

    public activateCanvas(canvas: PixelCanvas): void {
        if (this.activeCanvas) {
            this.activeCanvas.hide();
        }

        this.activeCanvas = canvas;
        this.activeCanvas.show();

        this.emit('canvas_activate', this.activeCanvas);

        const items = this.$container.querySelectorAll(`.project-item`);
        items.forEach((el) => {
            el.classList.remove('active');
            if (el.getAttribute('data-canvas-id') === canvas.id.toString()) {
                el.classList.add('active');
            }
        });
    }

    public addObject(options: CanvasOptions): PixelCanvas {
        const canvas = new PixelCanvas(options);
        canvas.on('pixel_highlight', (...args) => {
            this.emit('pixel_highlight', ...args);
        });
        canvas.on('pixel_draw', (...args) => {
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
    }

    public setCanvasDimensions(width: number | null, height: number | null): void {
        if (width) {
            this.canvasWidth = width;
        }
        if (height) {
            this.canvasHeight = height;
        }
        this.activeCanvas?.setDimensions(width, height);
    }

    private getObjectsInGroup(group: ObjectGroup): PixelCanvas[] {
        return this.canvases.filter(canvas => canvas.group === group);
    }
}
