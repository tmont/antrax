import { CodeGenerator } from './CodeGenerator.ts';
import { ColorPalette } from './ColorPalette.ts';
import type { ColorPaletteSet } from './ColorPaletteSet.ts';
import type { Atari7800Color } from './colors.ts';
import type { EditorSettings, UndoCheckpoint } from './Editor.ts';
import { type SerializationContext, SerializationTypeError } from './errors.ts';
import { EventEmitter } from './EventEmitter.ts';
import { Logger } from './Logger.ts';
import { Modal } from './Modal.ts';
import { ObjectGroup } from './ObjectGroup.ts';
import {
    type CanvasOptions,
    PixelCanvas,
    type PixelCanvasSerialized,
    type PixelDrawingEvent
} from './PixelCanvas.ts';
import { Popover } from './Popover.ts';
import {
    type AssemblyNumberFormatRadix,
    type CodeGenerationOptions,
    type CodeGenerationOptionsBase,
    type ColorIndex,
    CodeGenerationDetailLevel,
    type Coordinate,
    type DisplayModeColorIndex,
    type DisplayModeName,
    findElement,
    findInput,
    findOrDie,
    findSelect,
    findTemplateContent,
    parseTemplate,
    type PixelInfo,
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
    <div class="group-item project-list-item section-item">
        <div class="group-name-container">
            <i class="fa-solid fa-chevron-up collapse-icon"></i>
            <header class="group-name clamp-1"></header>
        </div>
        <div class="item-controls">
            <button type="button" class="btn btn-sm btn-secondary overflow-btn" title="More actions&hellip;">
                <i class="fa-solid fa-ellipsis-h"></i>
            </button>
        </div>
    </div>
    <div class="group-items"></div>
</div>
`;

const groupOverflowTmpl = `
<ul class="project-item-overflow list-unstyled dropdown-menu">
    <li class="dropdown-item"><a href="#" data-action="edit"><i class="fa-solid fa-fw fa-pencil icon"></i>Edit</a></li>
    <li class="dropdown-item divider"></li>
    <li class="dropdown-item"><a href="#" data-action="export-asm"><i class="fa-solid fa-fw fa-code icon"></i>Export ASM</a></li>
    <li class="dropdown-item"><a href="#" data-action="export-image" class="disabled"><i class="fa-solid fa-fw fa-images icon"></i>Export spritesheet</a></li>
    <li class="dropdown-item"><a href="#" data-action="export-image" class="disabled"><i class="fa-solid fa-fw fa-film icon"></i>Export animation</a></li>
    <li class="dropdown-item divider"></li>
    <li class="dropdown-item"><a href="#" data-action="delete" class="text-danger"><i class="fa-solid fa-fw fa-trash icon"></i>Delete</a></li>
</ul>
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
<form class="form-vertical">
    <div class="form-row">
        <input class="object-name-input form-control" type="text" maxlength="50" minlength="1" required />
    </div>
    <div class="submit-container">
        <button type="submit" class="btn btn-primary">Save</button>
    </div>
</form>
`;

const editGroupTmpl = `
<form class="form-vertical">
    <div class="form-row">
        <input class="group-name-input form-control" type="text" maxlength="50" minlength="1" required />
    </div>
    <div class="form-row">
        <select class="group-palette-set-select form-control" disabled></select>
    </div>
    <div class="submit-container">
        <button type="submit" class="btn btn-primary">Save</button>
    </div>
</form>
`;

export interface ProjectSerialized {
    name: Project['name'];
    activeCanvasId: string | number | null;
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
    pixel_hover: [ Coordinate, PixelInfo, PixelCanvas ];
    pixel_draw: [ PixelDrawingEvent, PixelCanvas ];
    pixel_draw_aggregate: [ Pick<PixelDrawingEvent, 'behavior'>, PixelCanvas ];
    canvas_reset: [ PixelCanvas ];
    active_object_name_change: [ PixelCanvas ];
    active_group_name_change: [ ObjectGroup ];
    draw_start: [ PixelCanvas ];
    pixel_dimensions_change: [ PixelCanvas ];
    canvas_dimensions_change: [ PixelCanvas ];
    display_mode_change: [ PixelCanvas ];
    canvas_palette_change: [ PixelCanvas ];
    canvas_active_color_change: [ PixelCanvas ];
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

    private createGroup(parent: HTMLElement, canvas: PixelCanvas): HTMLElement {
        const $group = parseTemplate(objectGroupTmpl);
        $group.setAttribute('data-group-id', canvas.group.id.toString());
        $group.querySelector('.group-name')?.appendChild(document.createTextNode(canvas.group.getName()));
        parent.appendChild($group);

        const $overflowContent = parseTemplate(groupOverflowTmpl);
        const overflowPopover = new Popover({
            content: $overflowContent,
            dropdown: true,
        });
        const $overflowBtn = findElement($group, '.overflow-btn');

        const $editForm = parseTemplate(editGroupTmpl);
        const editPopover = new Popover({
            content: $editForm,
            title: 'Edit group',
            arrowAlign: 'left',
        });

        const $groupName = findElement($group, '.group-name');
        const $input = findInput($editForm, '.group-name-input');
        const $paletteSetSelect = findSelect($editForm, '.group-palette-set-select');

        while ($paletteSetSelect.options.length) {
            $paletteSetSelect.options.remove(0);
        }

        const paletteSets = [ canvas.group.getPaletteSet() ];
        paletteSets.forEach((paletteSet) => {
            const option = document.createElement('option');
            option.value = paletteSet.id;
            option.innerText = paletteSet.getName();
            option.selected = paletteSet === canvas.group.getPaletteSet();
            $paletteSetSelect.options.add(option);
        });

        $editForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.setGroupName(canvas.group, $input.value);
            editPopover.hide();
        });

        $overflowContent.querySelectorAll('.dropdown-item a').forEach((anchor) => {
            anchor.addEventListener('click', (e) => {
                e.preventDefault();

                overflowPopover.hide();

                const action = anchor.getAttribute('data-action');
                switch (action) {
                    case 'edit':
                        $input.value = canvas.group.getName();
                        editPopover.show($groupName);
                        $input.focus();
                        break;
                    case 'delete':
                        this.removeGroup(canvas.group);
                        break;
                    case 'export-asm':
                        this.showExportASMModalForGroup(canvas.group);
                        break;
                }
            });
        });

        $overflowBtn.addEventListener('click', () => {
            const canvases = this.getObjectsInGroup(canvas.group);

            // disable "Export ASM" option if it's not supported by anything in the group
            const $exportAsm = findElement($overflowContent, '[data-action="export-asm"]');
            $exportAsm.classList.toggle('disabled', !canvases.some(canvas => canvas.canExportToASM()));

            overflowPopover.show($overflowBtn);
        });

        const $collapsible = findElement($group, '.group-name-container');
        $collapsible.addEventListener('click', () => {
            $group.classList.toggle('closed');
        });

        return $group;
    }

    private wireUpCanvas(canvas: PixelCanvas, insertAfter?: PixelCanvas): void {
        canvas.on('pixel_draw', (...args) => {
            this.updateThumbnailForCanvas(canvas);
            this.emit('pixel_draw', ...args, canvas);
        });
        canvas.on('pixel_draw_aggregate', (e) => {
            this.updateThumbnailForCanvas(canvas);
            this.emit('pixel_draw_aggregate', e, canvas);
        });
        canvas.on('pixel_hover', (...args) => {
            this.emit('pixel_hover', ...args, canvas);
        });
        canvas.on('reset', () => {
            this.emit('canvas_reset', canvas);
            this.updateThumbnailForCanvas(canvas);
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
        canvas.on('active_color_change', () => {
            this.emit('canvas_active_color_change', canvas);
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

        newItem.setAttribute('data-canvas-id', canvas.id.toString());

        let group = parent.querySelector(`.project-item-group[data-group-id="${canvas.group.id}"]`);
        if (!group) {
            group = this.createGroup(parent, canvas);
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
            arrowAlign: 'left',
        });

        const objectName = findElement(newItem, '.item-name');
        const input = findInput(editForm, '.object-name-input');
        editForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.setObjectName(canvas, input.value);
            editPopover.hide();
        });

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
                        this.exportCanvasToImage(canvas);
                        break;
                    case 'export-asm': {
                        this.showExportASMModal([ canvas ]);
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

    public exportCanvasToImage(canvas?: PixelCanvas | null): void {
        canvas = canvas || this.getActiveCanvas();
        canvas?.generateDataURL((url) => {
            if (!url) {
                Popover.toast({
                    content: 'Failed to generate image :(',
                    type: 'danger',
                });
                return;
            }

            window.open(url);
        }, 'full');
    }

    public showExportASMModalForGroup(group: ObjectGroup): void {
        this.showExportASMModal(this.getObjectsInGroup(group));
    }

    /**
     * @param canvases If omitted, defaults to the active canvas
     */
    public showExportASMModal(canvases?: PixelCanvas[]): void {
        if (!canvases) {
            const activeCanvas = this.getActiveCanvas();
            if (!activeCanvas) {
                return;
            }

            canvases = [ activeCanvas ];
        }

        canvases = canvases.filter(canvas => canvas.canExportToASM());
        if (!canvases[0]) {
            return;
        }

        const firstCanvas = canvases[0];

        // can only export multiple canvases if they are all the same group (since each
        // group can have a different palette set). this should not be possible to achieve
        // using the UI.
        canvases = canvases.filter(canvas => canvas.group === firstCanvas.group);

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
        const $detailLotsInput = findInput($el, '#export-detail-level-lots');
        const $detailSomeInput = findInput($el, '#export-detail-level-some');
        const $detailNoneInput = findInput($el, '#export-detail-level-none');

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
                commentLevel: $detailLotsInput.checked ?
                    CodeGenerationDetailLevel.Lots :
                    ($detailSomeInput.checked ? CodeGenerationDetailLevel.Some : CodeGenerationDetailLevel.None),
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

            if ($exportHeaderInput.checked) {
                canvases.forEach(canvas => genThunks.push(() => canvas.generateHeaderCode(options)));
            }
            if ($exportObjectInput.checked) {
                genThunks.push(() => CodeGenerator.generate(canvases, options));
                // canvases.forEach(canvas => genThunks.push(() => canvas.generateCode(options)));
            }
            if ($exportPalettesInput.checked) {
                // only need to export one palette set, as all canvases share the same one
                genThunks.push(() => firstCanvas.generatePalettesCode(options));
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
            $detailLotsInput,
            $detailSomeInput,
            $detailNoneInput,
        ]
            .forEach((input) => {
                input.addEventListener('change', generateCode);
            });

        const titleName = canvases.length === 1 ? firstCanvas.getName() : `all in ${firstCanvas.group.getName()}`;

        const exportModal = Modal.create({
            type: 'default',
            title: `Export ${titleName}`,
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

        this.logger.debug('showing export ASM modal');
        const $copySuccess = parseTemplate('<div><i class="fa-solid fa-check"></i> Code copied!</div>');
        const $copyError = parseTemplate('<div><i class="fa-solid fa-exclamation-triangle"></i> Failed to copy :(</div>');
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
    }

    public addObject(options: CanvasOptions, insertAfter?: PixelCanvas): PixelCanvas {
        const canvas = new PixelCanvas(options);
        this.wireUpCanvas(canvas, insertAfter);
        this.activateCanvas(canvas);
        return canvas;
    }

    public removeObject(canvas: PixelCanvas): void {
        this.logger.info(`removing object ${canvas.id}`);

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
            this.logger.info(`removing group ${canvas.group.id}`);
            // remove group if it has no objects
            this.$container.querySelector(`.project-item-group[data-group-id="${canvas.group.id}"]`)?.remove();
        }
    }

    public removeGroup(group: ObjectGroup): void {
        const objects = this.getObjectsInGroup(group);
        while (objects.length) {
            const canvas = objects.pop()!;
            this.removeObject(canvas);
        }

        // the "group" is removed from the UI when its last object is removed
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

    private setGroupName(group: ObjectGroup, newName: string): void {
        group.setName(newName);
        const nameEl = findElement(this.$container, `.project-item-group[data-group-id="${group.id}"] .group-name`);
        nameEl.innerText = group.getName();
        if (this.activeCanvas && this.activeCanvas.group === group) {
            this.emit('active_group_name_change', group);
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
        this.canvases
            .filter(canvas => canvas.group.getPaletteSet() === this.editorSettings.activeColorPaletteSet)
            .forEach(canvas => canvas.render());
        this.updateAllThumbnails();
    }

    public updatePaletteColor(palette: ColorPalette, colorIndex: ColorIndex): void {
        // NOTE: detecting which canvases are using a palette is annoying due to the
        // complexities of the display mode, so instead we just filter by palette set.
        // I mean, it's not THAT annoying given we already can fetch the colors for
        // a display mode+palette, but it seems wasteful to run that logic every time.
        // Another option is to actually cache the current display mode's colors on the
        // canvas, and then this would be free, but that might be some premature optimization.
        this.canvases
            .filter(canvas => canvas.group.getPaletteSet() === this.editorSettings.activeColorPaletteSet)
            .forEach(canvas => canvas.render());
        this.updateAllThumbnails();
    }

    public updateKangarooMode(): void {
        this.canvases.filter(canvas => canvas.supportsKangarooMode).forEach(canvas => canvas.render());
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
        this.ensureSerialized(json);

        const groupCache: Record<ObjectGroup['id'], ObjectGroup> = {};
        const canvases = json.canvases.map(canvasJson =>
            PixelCanvas.fromJSON(canvasJson, canvasMountEl, editorSettings, groupCache, paletteSets));

        return new Project({
            mountEl,
            editorSettings,
            name: json.name,
            canvases,
            activeCanvas: json.activeCanvasId ?
                canvases.find(canvas => canvas.id === String(json.activeCanvasId)) :
                null,
        });
    }

    public static ensureSerialized(json: any): asserts json is ProjectSerialized {
        const context: SerializationContext = 'Project';

        if (typeof json.name !== 'string') {
            throw new SerializationTypeError(context, 'name', 'string', json.name);
        }

        if (json.activeCanvasId !== null && typeof json.activeCanvasId !== 'string' && typeof json.activeCanvasId !== 'number') {
            throw new SerializationTypeError(context, 'activeCanvasId', 'string/number/null', json.activeCanvasId);
        }

        if (!Array.isArray(json.canvases) || !json.canvases.every((obj: unknown) => typeof obj === 'object')) {
            throw new SerializationTypeError(context, 'canvases', 'array of objects', json.canvases);
        }
    }
}
