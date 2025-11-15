import { type ColorIndex, ColorPalette } from './ColorPalette.ts';
import type { ColorPaletteSet } from './ColorPaletteSet.ts';
import type { Atari7800Color } from './colors.ts';
import type { EditorSettings, UndoCheckpoint } from './Editor.ts';
import { EventEmitter } from './EventEmitter.ts';
import { Logger } from './Logger.ts';
import { Modal } from './Modal.ts';
import { ObjectGroup } from './ObjectGroup.ts';
import {
    type CanvasOptions,
    type CodeGenerationOptions,
    type CodeGenerationOptionsBase,
    PixelCanvas,
    type PixelCanvasSerialized,
    type PixelDrawingEvent
} from './PixelCanvas.ts';
import { Popover } from './Popover.ts';
import {
    type AssemblyNumberFormatRadix,
    type DisplayModeColorIndex,
    type DisplayModeName,
    findElement,
    findInput,
    findOrDie,
    findSelect,
    findTemplateContent,
    parseTemplate
} from './utils.ts';

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
        <div class="object-details">
            <div>
                <span class="canvas-size"></span>
                <span class="text-muted">/</span>
                <span class="pixel-size"></span>
            </div>
            <span>&middot;</span>
            <div class="display-mode-name"></div>
            <span>&middot;</span>
            <div class="canvas-palette-details">
                <div class="palette-name"></div>
                <div class="palette-color-list"></div>
            </div>
        </div>
    </div>
</div>
`;

const objectGroupTmpl = `
<div class="project-item-group">
    <header class="group-name clamp-1 section-item"></header>
    <div class="indented-list group-items"></div>
</div>
`;

const objectOverflowTmpl = `
<ul class="project-item-overflow list-unstyled dropdown-menu">
    <li class="dropdown-item"><a href="#" data-action="edit"><i class="fa-solid fa-fw fa-pencil icon"></i>Edit</a></li>
    <li class="dropdown-item"><a href="#" data-action="clone"><i class="fa-solid fa-fw fa-clone icon"></i>Clone</a></li>
    <li class="dropdown-item"><a href="#" data-action="clear"><i class="fa-solid fa-fw fa-eraser icon"></i>Clear</a></li>
    <li class="dropdown-item divider"></li>
    <li class="dropdown-item"><a href="#" data-action="export-asm"><i class="fa-solid fa-fw fa-code icon"></i>Export ASM</a></li>
    <li class="dropdown-item"><a href="#" data-action="export-image"><i class="fa-solid fa-fw fa-image icon"></i>Export image</a></li>
    <li class="dropdown-item divider"></li>
    <li class="dropdown-item"><a href="#" data-action="delete" class="text-danger"><i class="fa-solid fa-fw fa-trash icon"></i>Delete</a></li>
</ul>
`;

const editObjectTmpl = `
<form class="object-edit-container form-vertical">
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
    activeCanvas?: PixelCanvas | null;
}

export type ProjectEventMap = {
    canvas_activate: [ PixelCanvas | null ];
    pixel_highlight: [ PixelDrawingEvent, PixelCanvas ];
    pixel_draw: [ PixelDrawingEvent, PixelCanvas ];
    canvas_reset: [ PixelCanvas ];
    canvas_render: [ PixelCanvas ];
    active_object_name_change: [ PixelCanvas ];
    draw_start: [ PixelCanvas ];
    pixel_dimensions_change: [ PixelCanvas ];
    canvas_dimensions_change: [ PixelCanvas ];
    display_mode_change: [ PixelCanvas ];
    canvas_palette_change: [ PixelCanvas ];
};

export class Project extends EventEmitter<ProjectEventMap> {
    private readonly canvases: PixelCanvas[];
    private activeCanvas: PixelCanvas | null;
    public name: string;
    private readonly $container: HTMLElement;
    private initialized = false;
    private readonly editorSettings: Readonly<EditorSettings>;
    private readonly logger: Logger;

    public constructor(options: ProjectOptions) {
        super();
        this.name = options.name;
        this.$container = options.mountEl;
        this.editorSettings = options.editorSettings;
        this.canvases = options.canvases || [];
        this.activeCanvas = options.activeCanvas && this.canvases.indexOf(options.activeCanvas) !== -1 ?
            options.activeCanvas :
            null;

        this.logger = Logger.from(this);
    }

    public init(): void {
        if (this.initialized) {
            return;
        }

        this.canvases.forEach(canvas => {
            this.wireUpCanvas(canvas);

            // necessary to make the thumbnails render
            canvas.render();
        });
        if (this.activeCanvas) {
            this.activateCanvas(this.activeCanvas);
        } else if (this.canvases[0]) {
            this.activateCanvas(this.canvases[0]);
        }

        this.update();
        this.updateAllThumbnails();

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

    public getActiveCanvas(): PixelCanvas | null {
        return this.activeCanvas;
    }

    public activateCanvas(canvas: PixelCanvas | null): void {
        if (canvas) {
            this.logger.debug('activating canvas', canvas.id);
        }

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

        this.updateActiveObjectInfo();
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
            displayMode: canvas.getDisplayMode(),
            palette: canvas.getColorPalette(),
            editorSettings: this.editorSettings,
        }, canvas);
    }

    private wireUpCanvas(canvas: PixelCanvas, insertAfter?: PixelCanvas): void {
        canvas.on('pixel_highlight', (...args) => {
            this.emit('pixel_highlight', ...args, canvas);
        });
        canvas.on('pixel_draw', (...args) => {
            if (canvas === this.activeCanvas) {
                this.updateActiveThumbnail();
            }

            this.emit('pixel_draw', ...args, canvas);
        });
        canvas.on('reset', () => {
            this.emit('canvas_reset', canvas);
        });
        canvas.on('draw_start', () => {
            this.emit('draw_start', canvas);
        });
        canvas.on('display_mode_change', () => {
            this.emit('display_mode_change', canvas);
        });
        canvas.on('palette_change', () => {
            this.emit('canvas_palette_change', canvas);
        });
        canvas.on('pixel_dimensions_change', () => {
            this.emit('pixel_dimensions_change', canvas);
        });
        canvas.on('canvas_dimensions_change', () => {
            this.emit('canvas_dimensions_change', canvas);
        });
        canvas.on('render', () => {
            if (canvas === this.activeCanvas) {
                this.updateActiveObjectInfo();
            }

            this.emit('canvas_render', canvas);
        });

        if (this.canvases.indexOf(canvas) === -1) {
            if (insertAfter) {
                const index = this.canvases.indexOf(insertAfter);
                if (index !== -1) {
                    this.logger.debug(`inserting new canvas at index`, index);
                    this.canvases.splice(index + 1, 0, canvas);
                } else {
                    this.canvases.push(canvas);
                }
            } else {
                this.canvases.push(canvas);
            }
        }

        const newItem = parseTemplate(objectItemTmpl);
        const parent = findElement(this.$container, `.project-objects`);

        findElement(newItem, '.item-name').addEventListener('click', (e) => {
            e.preventDefault();
            this.activateCanvas(canvas);
        });

        const doc = this.$container.ownerDocument;
        newItem.setAttribute('data-canvas-id', canvas.id.toString());

        let group = parent.querySelector(`.project-item-group[data-group-id="${canvas.group.id}"]`);
        if (!group) {
            group = parseTemplate(objectGroupTmpl);
            group.setAttribute('data-group-id', canvas.group.id.toString());
            group.querySelector('.group-name')?.appendChild(doc.createTextNode(canvas.group.getName()));
            parent.appendChild(group);
        }

        if (insertAfter) {
            const sibling = findElement(group, `.group-items .project-item[data-canvas-id="${insertAfter.id}"`);
            sibling.insertAdjacentElement('afterend', newItem);
        } else {
            findElement(group, '.group-items').appendChild(newItem);
        }
        findElement(newItem, '.clone-object-btn').addEventListener('click', () => {
            this.cloneObject(canvas);
        });

        const $overflowContent = parseTemplate(objectOverflowTmpl);
        const overflowPopover = new Popover({
            content: $overflowContent,
            dropdown: true,
        });
        const $overflowBtn = findElement(newItem, '.overflow-btn');

        const editForm = parseTemplate(editObjectTmpl);
        const editPopover = new Popover({
            content: editForm,
            title: 'Change object name',
        });

        const objectName = findElement(newItem, '.item-name');
        const input = findInput(editForm, '.object-name-input');
        editForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.setObjectName(canvas, input.value);
            editPopover.hide();
        });

        const $copySuccess = parseTemplate('<div><i class="fa-solid fa-check"></i> Code copied!</div>');
        const $copyError = parseTemplate('<div><i class="fa-solid fa-exclamation-triangle"></i> Failed to copy :(</div>');
        $overflowContent.querySelectorAll('.dropdown-item a').forEach((anchor) => {
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
                    case 'export-image':
                        canvas.generateDataURL((url) => {
                            if (!url) {
                                Popover.toast({
                                    content: 'Failed to generate image :(',
                                    type: 'danger',
                                });
                                return;
                            }

                            window.open(url);
                        }, 'full');
                        break;
                    case 'export-asm': {
                        const exportId = 'export';
                        const content = findTemplateContent(document, '#modal-content-export-form');

                        const $el = content.cloneNode(true) as ParentNode;
                        const $codeTextarea = findOrDie($el, '.export-code', node => node instanceof HTMLTextAreaElement);
                        const $indentTabInput = findInput($el, '#export-indent-tab');
                        const $indent4SpacesInput = findInput($el, '#export-indent-spaces-4');
                        const $indent2SpacesInput = findInput($el, '#export-indent-spaces-2');
                        const $addressInput = findInput($el, '#export-address');
                        const $addressLabelInput = findInput($el, '#export-address-label');
                        const $byteRadixInput = findSelect($el, '#export-byte-radix');
                        const $labelColonInput = findInput($el, '#export-label-colon');
                        const $exportObjectInput = findInput($el, '#export-object');
                        const $exportHeaderInput = findInput($el, '#export-header');
                        const $exportPalettesInput = findInput($el, '#export-palettes');

                        const generateCode = (): boolean => {
                            const baseOptions: CodeGenerationOptionsBase = {
                                addressOffsetRadix: 16,
                                indentChar: $indentTabInput.checked ?
                                    '\t' :
                                    ($indent2SpacesInput.checked ? '  ' : '    '),
                                labelColon: $labelColonInput.checked,
                                byteRadix: Number($byteRadixInput.value) as AssemblyNumberFormatRadix,
                                object: $exportObjectInput.checked,
                                header: $exportHeaderInput.checked,
                            };

                            let byteOffsetRaw = $addressInput.value;
                            let options: CodeGenerationOptions;

                            if ($addressLabelInput.checked) {
                                options = {
                                    ...baseOptions,
                                    addressLabel: byteOffsetRaw,
                                };
                            } else {
                                let byteOffset: number;
                                if (byteOffsetRaw.startsWith('$')) {
                                    byteOffset = parseInt(byteOffsetRaw.substring(1), 16);
                                } else if (byteOffsetRaw.startsWith('%')) {
                                    byteOffset = parseInt(byteOffsetRaw.substring(1), 2);
                                } else {
                                    byteOffset = parseInt(byteOffsetRaw, 10);
                                }

                                options = {
                                    ...baseOptions,
                                    addressOffset: byteOffset,
                                };
                            }

                            const genThunks: Array<() => string> = [];

                            if ($exportObjectInput.checked) {
                                genThunks.push(() => canvas.generateCode(options));
                            }
                            if ($exportHeaderInput.checked) {
                                genThunks.push(() => canvas.generateHeaderCode(options));
                            }
                            if ($exportPalettesInput.checked) {
                                genThunks.push(() => canvas.generatePalettesCode(options));
                            }

                            try {
                                $codeTextarea.value = genThunks.map(thunk => thunk()).join('\n\n');
                                return true;
                            } catch (e) {
                                Popover.toast({
                                    content: `Code generation failure: ${(e as Error).message}`,
                                    type: 'danger',
                                });
                            }

                            return false;
                        };

                        if (!generateCode()) {
                            return;
                        }

                        [
                            $indentTabInput,
                            $indent2SpacesInput,
                            $indent4SpacesInput,
                            $addressInput,
                            $addressLabelInput,
                            $byteRadixInput,
                            $labelColonInput,
                            $exportPalettesInput,
                            $exportObjectInput,
                            $exportHeaderInput,
                        ]
                            .forEach((input) => {
                                input.addEventListener('change', generateCode);
                            });

                        const exportModal = Modal.create({
                            type: 'default',
                            title: 'Export object',
                            actions: [
                                'cancel',
                                {
                                    id: exportId,
                                    align: 'end',
                                    labelHtml: '<i class="fa-solid fa-copy"></i> Copy',
                                    type: 'primary',
                                },
                            ],
                            contentHtml: $el,
                        });

                        exportModal.show();
                        exportModal.on('action', async (action) => {
                            if (action.id === exportId) {
                                this.logger.debug('exporting!');
                                try {
                                    await navigator.clipboard.writeText($codeTextarea.value);
                                    this.logger.info(`successfully wrote to clipboard`);
                                    Popover.toast({
                                        type: 'success',
                                        content: $copySuccess,
                                    });
                                } catch (e) {
                                    this.logger.error(`failed to write to clipboard`, e);
                                    Popover.toast({
                                        type: 'danger',
                                        content: $copyError,
                                    });
                                }
                            }
                        });
                        break;
                    }
                    case 'delete':
                        this.removeObject(canvas);
                        break;
                }

                overflowPopover.hide();
            });
        });

        $overflowBtn.addEventListener('click', () => {
            // disable "Export ASM" option if it's not supported
            const $exportAsm = findElement($overflowContent, '[data-action="export-asm"]');
            $exportAsm.classList.toggle('disabled', !canvas.getDisplayMode().canExportToASM);

            overflowPopover.show($overflowBtn);
        });

        this.setObjectName(canvas, canvas.getName());
    }

    public addObject(options: CanvasOptions, insertAfter?: PixelCanvas): PixelCanvas {
        const canvas = new PixelCanvas(options);
        this.wireUpCanvas(canvas, insertAfter);
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

    public setObjectName(canvas: PixelCanvas, newName: string): void {
        canvas.setName(newName);
        const nameEl = findElement(this.$container, `.project-item[data-canvas-id="${canvas.id}"] .item-name`);
        nameEl.innerText = canvas.getName();
        if (canvas === this.activeCanvas) {
            this.emit('active_object_name_change', canvas);
        }
    }

    public updateActiveObjectInfo(): void {
        const $el = this.findActiveProjectItem();
        const canvas = this.activeCanvas;
        if (!$el || !canvas) {
            return;
        }

        this.updateActiveThumbnail();

        const { width, height } = canvas.getDimensions();
        const { width: pixelWidth, height: pixelHeight } = canvas.getPixelDimensions();

        findElement($el, '.canvas-size').innerText = `${width}×${height}`;
        findElement($el, '.pixel-size').innerText = `${pixelWidth}×${pixelHeight}`;

        const displayMode = canvas.getDisplayMode();
        findElement($el, '.display-mode-name').innerText = displayMode.name;

        const $paletteName = findElement($el, '.palette-name');
        const $colorList = findElement($el, '.palette-color-list');
        $colorList.innerHTML = '';

        if (displayMode.hasSinglePalette) {
            $paletteName.innerText = canvas.getColorPalette().name;

            canvas.getColorPalette().colors.forEach((color) => {
                const $swatch = document.createElement('div');
                $swatch.classList.add('color-swatch');
                $swatch.style.backgroundColor = color.hex;
                $colorList.appendChild($swatch);
            });
        } else {
            $colorList.innerText = 'n/a';
            $paletteName.innerHTML = '';
        }
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

    public zoomTo(): void {
        this.canvases.forEach(canvas => canvas.setZoomLevel(canvas === this.activeCanvas));
    }

    public setShowGrid(): void {
        this.activeCanvas?.setShowGrid();
    }

    public setUncoloredPixelBehavior(): void {
        this.canvases.forEach(canvas => canvas.setUncoloredPixelBehavior());
        this.updateAllThumbnails();
    }

    public setPixelDimensions(width: number | null, height: number | null): void {
        if (this.activeCanvas) {
            this.activeCanvas.setPixelDimensions(width, height);
            this.updateActiveObjectInfo();
        }
    }

    public setCanvasDimensions(width: number | null, height: number | null): void {
        if (this.activeCanvas) {
            this.activeCanvas.setDimensions(width, height);
            this.updateActiveObjectInfo();
        }
    }

    public setDisplayMode(newMode: DisplayModeName): void {
        if (this.activeCanvas) {
            this.activeCanvas.setDisplayMode(newMode);
        }
    }

    private getObjectsInGroup(group: ObjectGroup): PixelCanvas[] {
        return this.canvases.filter(canvas => canvas.group === group);
    }

    public setActiveColor(colorValue: DisplayModeColorIndex): void {
        this.activeCanvas?.setActiveColor(colorValue);
    }

    public setColorPalette(palette: ColorPalette): void {
        this.activeCanvas?.setColorPalette(palette);
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

    public applyCheckpoint(undoCanvas: PixelCanvas, checkpoint: UndoCheckpoint): void {
        const canvas = this.canvases.find(canvas => canvas === undoCanvas);
        if (!canvas) {
            this.logger.warn(`cannot undo because PixelCanvas{${undoCanvas.id}} is not in this project`);
            return;
        }

        canvas.setPixelData(checkpoint.pixelData);
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

        const canvases = json.canvases.map(canvasJson =>
            PixelCanvas.fromJSON(canvasJson, canvasMountEl, editorSettings, groupCache, paletteSets));

        return new Project({
            mountEl,
            editorSettings,
            name: json.name,
            canvases,
            activeCanvas: json.activeCanvasId ? canvases.find(canvas => canvas.id === json.activeCanvasId) : null,
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
