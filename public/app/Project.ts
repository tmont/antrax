import { type ColorIndex, ColorPalette } from './ColorPalette.ts';
import type { ColorPaletteSet } from './ColorPaletteSet.ts';
import type { Atari7800Color } from './colors.ts';
import type { EditorSettings } from './Editor.ts';
import { EventEmitter } from './EventEmitter.ts';
import { ObjectGroup } from './ObjectGroup.ts';
import { type CanvasOptions, PixelCanvas, type PixelCanvasSerialized, type PixelDrawingEvent } from './PixelCanvas.ts';
import { Popover } from './Popover.ts';
import { findElement, findOrDie, parseTemplate } from './utils.ts';

// https://stackoverflow.com/a/13139830
const emptyGif = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

const objectItemTmpl = `
<div class="project-item">
    <div class="project-list-item">
        <img alt="" class="object-thumbnail" src="${emptyGif}" />
        <a href="#" class="item-name clamp-1"></a>
        <div class="item-controls">
            <button type="button" class="btn btn-sm btn-success clone-object-btn" title="Clone object in same group">
                <i class="fa-solid fa-clone"></i>
            </button>
            <button type="button" class="btn btn-sm btn-secondary overflow-btn" title="More actions&hellip;">
                <i class="fa-solid fa-ellipsis-h"></i>
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

const objectOverflowTmpl = `
<ul class="project-item-overflow list-unstyled dropdown-menu">
    <li class="dropdown-item"><a href="#" data-action="edit"><i class="fa-solid fa-fw fa-pencil icon"></i>Edit</a></li>
    <li class="dropdown-item"><a href="#" data-action="clone"><i class="fa-solid fa-fw fa-clone icon"></i>Clone</a></li>
    <li class="dropdown-item"><a href="#" data-action="clear"><i class="fa-solid fa-fw fa-eraser icon"></i>Clear</a></li>
    <li class="dropdown-item disabled"><a href="#" data-action="export"><i class="fa-solid fa-fw fa-file-export icon"></i>Export</a></li>
    <li class="dropdown-item divider"></li>
    <li class="dropdown-item"><a href="#" data-action="delete" class="text-danger"><i class="fa-solid fa-fw fa-trash icon"></i>Delete</a></li>
</ul>
`;

const editObjectTmpl = `
<form class="object-edit-container">
    <div class="form-row">
        <input class="object-name-input form-control" type="text" maxlength="50" minlength="1" required />
    </div>
    <div class="submit-container">
        <button type="submit" class="btn btn-primary">Save</button>
    </div>
</form>
`;

export interface ProjectSerialized {
    name: Project['name'];
    activeCanvasId: number | null;
    canvases: PixelCanvasSerialized[];
}

export interface ProjectOptions {
    mountEl: HTMLElement;
    editorSettings: EditorSettings;
    name: string;
    canvases?: PixelCanvas[];
}

export type ProjectEventMap = {
    canvas_activate: [ PixelCanvas | null ];
    pixel_highlight: [ PixelDrawingEvent ];
    pixel_draw: [ PixelDrawingEvent ];
    active_object_name_change: [ PixelCanvas ];
};

export class Project extends EventEmitter<ProjectEventMap> {
    private readonly canvases: PixelCanvas[];
    private activeCanvas: PixelCanvas | null = null;
    public name: string;
    private readonly $container: HTMLElement;
    private initialized = false;
    private readonly editorSettings: Readonly<EditorSettings>;

    public constructor(options: ProjectOptions) {
        super();
        this.name = options.name;
        this.$container = options.mountEl;
        this.editorSettings = options.editorSettings;
        this.canvases = options.canvases || [];
    }

    public init(): void {
        if (this.initialized) {
            return;
        }

        this.canvases.forEach(canvas => this.wireUpCanvas(canvas));

        this.update();
        this.editorSettings.activeColorPalette.setActiveState(true, this.editorSettings.activeColorIndex);

        this.initialized = true;
    }

    public destroy(): void {
        this.canvases.forEach((canvas) => {
            this.activeCanvas = null;
            canvas.off();
            canvas.destroy();
            findElement(this.$container, `.project-objects`).innerHTML = '';
        });
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

    public cloneObject(canvas: PixelCanvas): PixelCanvas {
        const { width: pixelWidth, height: pixelHeight } = canvas.getPixelDimensions();
        const { width, height } = canvas.getDimensions();

        return this.addObject({
            group: canvas.group,
            mountEl: canvas.getContainer(),
            pixelWidth: pixelWidth,
            pixelHeight: pixelHeight,
            width: width,
            height: height,
            pixelData: canvas.clonePixelData(),
            editorSettings: this.editorSettings,
        });
    }

    private wireUpCanvas(canvas: PixelCanvas): void {
        canvas.on('pixel_highlight', (...args) => {
            this.emit('pixel_highlight', ...args);
        });
        canvas.on('pixel_draw', (...args) => {
            this.updateActiveThumbnail();
            this.emit('pixel_draw', ...args);
        });
        canvas.on('reset', () => {
            this.updateActiveThumbnail();
        });

        if (this.canvases.indexOf(canvas) === -1) {
            this.canvases.push(canvas);
        }

        const el = parseTemplate(objectItemTmpl);
        const parent = findElement(this.$container, `.project-objects`);

        findElement(el, '.item-name').addEventListener('click', (e) => {
            e.preventDefault();
            this.activateCanvas(canvas);
        });

        const doc = this.$container.ownerDocument;
        el.setAttribute('data-canvas-id', canvas.id.toString());

        let group = parent.querySelector(`.project-item-group[data-group-id="${canvas.group.id}"]`);
        if (!group) {
            group = parseTemplate(objectGroupTmpl);
            group.setAttribute('data-group-id', canvas.group.id);
            group.querySelector('.group-name')?.appendChild(doc.createTextNode(canvas.group.name));
            parent.appendChild(group);
        }

        findElement(group, '.group-items').appendChild(el);
        findElement(el, '.clone-object-btn').addEventListener('click', () => {
            this.cloneObject(canvas);
        });

        const overflowContent = parseTemplate(objectOverflowTmpl);
        const overflowPopover = new Popover({
            content: overflowContent,
            dropdown: true,
        });
        const $overflow = findElement(el, '.overflow-btn');

        const editForm = parseTemplate(editObjectTmpl);
        const editPopover = new Popover({
            content: editForm,
            title: 'Change object name',
        });

        const objectName = findElement(el, '.item-name');
        const input = findOrDie(editForm, '.object-name-input', node => node instanceof HTMLInputElement);
        editForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.setObjectName(canvas, input.value);
            editPopover.hide();
        });

        overflowContent.querySelectorAll('.dropdown-item a').forEach((anchor) => {
            anchor.addEventListener('click', (e) => {
                e.preventDefault();

                const action = anchor.getAttribute('data-action');
                switch (action) {
                    case 'edit':
                        overflowPopover.hide();
                        input.value = canvas.getName();
                        editPopover.show(objectName);
                        input.focus();
                        break;
                    case 'clear':
                        canvas.reset();
                        break;
                    case 'clone':
                        this.cloneObject(canvas);
                        break;
                    case 'export':
                        break;
                    case 'delete':
                        this.removeObject(canvas);
                        break;
                }

                overflowPopover.hide();
            });
        });

        $overflow.addEventListener('click', () => {
            overflowPopover.show($overflow);
        });

        this.setObjectName(canvas, canvas.getName());

        canvas.render();

        this.activateCanvas(canvas);
    }

    public addObject(options: CanvasOptions): PixelCanvas {
        const canvas = new PixelCanvas(options);
        this.wireUpCanvas(canvas);
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

    public setObjectName(canvas: PixelCanvas, newName: string): void {
        canvas.setName(newName);
        const nameEl = findElement(this.$container, `.project-item[data-canvas-id="${canvas.id}"] .item-name`);
        nameEl.innerText = canvas.getName();
        if (canvas === this.activeCanvas) {
            this.emit('active_object_name_change', canvas);
        }
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

    public zoomTo(): void {
        this.canvases.forEach(canvas => canvas.setZoomLevel());
    }

    public setShowGrid(): void {
        this.canvases.forEach(canvas => canvas.setShowGrid());
    }

    public setPixelDimensions(width: number | null, height: number | null): void {
        this.activeCanvas?.setPixelDimensions(width, height);
        this.updateObjectInfo();
    }

    public setCanvasDimensions(width: number | null, height: number | null): void {
        this.activeCanvas?.setDimensions(width, height);
        this.updateObjectInfo();
    }

    private getObjectsInGroup(group: ObjectGroup): PixelCanvas[] {
        return this.canvases.filter(canvas => canvas.group === group);
    }

    public setActiveColor(paletteSet: ColorPaletteSet, palette: ColorPalette, index: ColorIndex): void {
        // TODO this should probably only be for groups with the active palette set...
        // this.canvases.forEach(canvas => canvas.group.setActiveColor());
    }

    public setBackgroundColor(color: Atari7800Color): void {
        // TODO this should probably only be for groups with the active palette set...
        this.canvases.forEach(canvas => canvas.render());
        this.updateAllThumbnails();
    }

    public updatePaletteColor(palette: ColorPalette, colorIndex: ColorIndex): void {
        // TODO this should probably only be for canvases using this palette...
        this.canvases.forEach(canvas => canvas.render());
        this.updateAllThumbnails();
    }

    public toJSON(): ProjectSerialized {
        return {
            name: this.name,
            activeCanvasId: this.activeCanvas?.id || null,
            canvases: this.canvases.map(canvas => canvas.toJSON()),
        };
    }

    public static fromJSON(
        json: object,
        mountEl: HTMLElement,
        canvasMountEl: HTMLElement,
        editorSettings: EditorSettings,
        paletteSets: Readonly<ColorPaletteSet[]>,
    ): Project {
        if (!isSerialized(json)) {
            throw new Error(`Cannot deserialize Project, invalid JSON`);
        }

        const groupCache: any = {};

        return new Project({
            mountEl,
            editorSettings,
            name: json.name,
            canvases: json.canvases.map(canvasJson =>
                PixelCanvas.fromJSON(canvasJson, canvasMountEl, editorSettings, groupCache, paletteSets)),
        });
    }
}

const isSerialized = (json: any): json is ProjectSerialized => {
    if (typeof json !== 'object') {
        return false;
    }
    if (!json) {
        return false;
    }

    if (typeof json.name !== 'string') {
        return false;
    }
    if (!Array.isArray(json.canvases)) {
        return false;
    }

    if (!json.canvases.every((obj: unknown) => typeof obj === 'object')) {
        return false;
    }

    return true;
};
