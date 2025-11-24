import type { ColorPaletteSet } from './ColorPaletteSet.ts';
import type { EditorSettings } from './Editor.ts';
import { type SerializationContext, SerializationTypeError } from './errors.ts';
import { EventEmitter } from './EventEmitter.ts';
import { Logger } from './Logger.ts';
import { Modal } from './Modal.ts';
import type { ObjectGroup } from './ObjectGroup.ts';
import { PixelCanvas, type PixelCanvasSerialized } from './PixelCanvas.ts';
import { Popover } from './Popover.ts';
import {
    findElement,
    findInput,
    findOrDie,
    parseTemplate
} from './utils.ts';

const objectItemTmpl = `
<div class="project-item" data-drag-item="object-group">
    <div class="project-list-item">
        <canvas class="object-thumbnail" width="32" height="32"></canvas>
        <div class="item-name clamp-1"></div>
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
        <i class="icon fa-solid fa-grip" title="re-order this object" data-drag-handle></i>
        <div class="object-details">
            <span class="canvas-size"></span>
            <div class="display-mode-details">
                <div class="display-mode-name"></div>
                <span class="text-muted">&middot;</span>
                <div class="canvas-palette-details">
                    <div class="palette-name"></div>
                    <div class="palette-color-list"></div>
                </div>
            </div>
        </div>
    </div>
</div>
`;

const objectOverflowTmpl = `
<ul class="project-item-overflow list-unstyled dropdown-menu">
    <li class="dropdown-item"><a href="#" data-action="edit"><i class="fa-solid fa-fw fa-pencil icon"></i>Edit&hellip;</a></li>
    <li class="dropdown-item"><a href="#" data-action="clone"><i class="fa-solid fa-fw fa-clone icon"></i>Clone</a></li>
    <li class="dropdown-item"><a href="#" data-action="clear"><i class="fa-solid fa-fw fa-eraser icon"></i>Clear</a></li>
    <li class="dropdown-item divider"></li>
    <li class="dropdown-item"><a href="#" data-action="export-asm"><i class="fa-solid fa-fw fa-code icon"></i>Export ASM&hellip;</a></li>
    <li class="dropdown-item"><a href="#" data-action="export-image"><i class="fa-solid fa-fw fa-image icon"></i>Export image</a></li>
    <li class="dropdown-item divider"></li>
    <li class="dropdown-item"><a href="#" data-action="delete" class="text-danger"><i class="fa-solid fa-fw fa-trash icon"></i>Delete&hellip;</a></li>
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

const activeClass = 'active';

export interface ObjectGroupItemOptions {
    canvas: PixelCanvas;
    mountEl: HTMLElement;
}

export type ObjectGroupItemEventMap = {
    delete: [];
    action_clone: [];
    action_export_asm: [];
    activate: [];
    deactivate: [];
    canvas_group_change: [ ObjectGroupItem ];
};

export interface ObjectGroupItemSerialized {
    canvas: PixelCanvasSerialized;
}

export class ObjectGroupItem extends EventEmitter<ObjectGroupItemEventMap> {
    public readonly canvas: PixelCanvas;
    private readonly logger: Logger;
    private $container: HTMLElement;
    private readonly $el: HTMLElement;
    private readonly $thumbnail: HTMLCanvasElement;
    private initialized = false;

    public constructor(options: ObjectGroupItemOptions) {
        super();

        this.canvas = options.canvas;
        this.$container = options.mountEl;
        this.$el = parseTemplate(objectItemTmpl);
        this.$el.setAttribute('data-item-id', this.id);
        this.$thumbnail = findOrDie(this.$el, '.object-thumbnail', node => node instanceof HTMLCanvasElement);

        this.logger = Logger.from(this);
    }

    public get id(): string {
        return this.canvas.id;
    }

    public get name(): string {
        return `ObjectGroupItem(${this.canvasName})`;
    }

    public get canvasName(): string {
        return this.canvas.getName();
    }

    public get isActive(): boolean {
        return this.$el.classList.contains(activeClass);
    }

    public setName(newName: string, force = false): void {
        if (!newName || (!force && this.canvasName === newName)) {
            return;
        }

        this.logger.debug(`setting name to "${newName}"`);
        this.canvas.setName(newName);
        findElement(this.$el, '.item-name').innerText = this.canvasName;
    }

    public setGroup(newGroup: ObjectGroup): void {
        this.canvas.setGroup(newGroup);
    }

    public init(insertBefore: ObjectGroupItem | null = null): void {
        if (this.initialized) {
            return;
        }

        this.logger.debug('initializing');

        if (!insertBefore) {
            this.logger.debug(`appending to end`);
            this.$container.appendChild(this.$el);
        } else {
            this.logger.debug(`inserting before ${insertBefore.name}`);
            findElement(this.$container, `[data-item-id="${insertBefore.id}"]`)
                .insertAdjacentElement('beforebegin', this.$el);
        }

        const canvas = this.canvas;

        canvas.on('pixel_draw', () => this.updateThumbnail());
        canvas.on('pixel_draw_aggregate', () => this.updateThumbnail());
        canvas.on('reset', () => this.updateThumbnail());
        canvas.on('display_mode_change', () => this.syncObjectDetailsUI());
        canvas.on('palette_change', () => this.syncObjectDetailsUI());
        canvas.on('canvas_dimensions_change', () => this.syncObjectDetailsUI());
        canvas.on('group_change', () => {
            this.$container = canvas.getGroup().$itemContainer;
            this.emit('canvas_group_change', this);
        });

        const $el = this.$el;

        $el.addEventListener('click', (e) => {
            if (e.target instanceof HTMLElement && e.target.closest('button')) {
                // if they click inside one of the buttons, let that event take precedence
                return;
            }

            this.activate();
        });

        $el.setAttribute('data-item-id', this.id);

        findElement($el, '.clone-object-btn').addEventListener('click', () => {
            this.emit('action_clone');
        });

        const $overflowContent = parseTemplate(objectOverflowTmpl);
        const overflowPopover = new Popover({
            content: $overflowContent,
            dropdown: true,
        });
        const $overflowBtn = findElement($el, '.overflow-btn');

        const editForm = parseTemplate(editObjectTmpl);
        const editPopover = new Popover({
            content: editForm,
            title: 'Change object name',
            arrowAlign: 'left',
        });

        const objectName = findElement($el, '.item-name');
        const input = findInput(editForm, '.object-name-input');
        editForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.setName(input.value);
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
                        this.emit('action_clone');
                        break;
                    case 'export-image':
                        this.exportCanvasToImage();
                        break;
                    case 'export-asm':
                        this.emit('action_export_asm');
                        break;
                    case 'delete': {
                        const modal = Modal.confirm(
                            {
                                title: `Delete ${this.canvas.getName()}`,
                                contentText: `Are you sure you want to delete this object? This cannot be undone.`,
                            },
                            () => this.delete(),
                        );

                        modal.show();
                        break;
                    }
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

        this.setName(this.canvasName, true);

        this.syncObjectDetailsUI();

        // necessary for making the thumbnails render properly, even though not all the canvases
        // are actually visible
        canvas.render();

        this.initialized = true;
    }

    public exportCanvasToImage(): void {
        const canvas = this.canvas;
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
    }

    public updateThumbnail(): void {
        this.canvas.copyImageToCanvas(this.$thumbnail, 20);
    }

    public updateObjectInfo(): void {
        this.updateThumbnail(); // TODO don't call this from here, it should be called when needed
        this.syncObjectDetailsUI();
    }

    public syncObjectDetailsUI(): void {
        const canvas = this.canvas;
        const $el = this.$el;
        const { width, height } = canvas.getDimensions();

        findElement($el, '.canvas-size').innerText = `${width}×${height}`;

        const displayMode = canvas.getDisplayMode();
        findElement($el, '.display-mode-name').innerText = displayMode.name;

        const $paletteName = findElement($el, '.palette-name');
        const $colorList = findElement($el, '.palette-color-list');
        const $displayModeDetails = findElement($el, '.display-mode-details');
        $colorList.innerHTML = '';

        if (displayMode.hasSinglePalette) {
            $displayModeDetails.style.display = '';
            $paletteName.innerText = canvas.getColorPalette().name;

            canvas.getColorPalette().colors.forEach((color) => {
                const $swatch = document.createElement('div');
                $swatch.classList.add('color-swatch');
                $swatch.style.backgroundColor = color.hex;
                $colorList.appendChild($swatch);
            });
        } else {
            $paletteName.innerHTML = '';
            $displayModeDetails.style.display = 'none';
        }
    }

    public delete(): void {
        this.logger.info(`deleting`);
        this.$el.remove();
        this.canvas.destroy();
        this.emit('delete');
    }

    public activate(): void {
        if (this.isActive) {
            return;
        }

        this.logger.info('activating');
        this.canvas.show();
        this.$el.classList.add(activeClass);
        this.emit('activate');
    }

    public deactivate(): void {
        if (!this.isActive) {
            return;
        }

        this.logger.info('deactivating');
        this.canvas.hide();
        this.$el.classList.remove(activeClass);
        this.emit('deactivate');
    }

    public clone(): ObjectGroupItem {
        return new ObjectGroupItem({
            canvas: this.canvas.clone(),
            mountEl: this.$container,
        });
    }

    public syncPaletteColors(): void {
        this.syncObjectDetailsUI();
    }

    public toJSON(): ObjectGroupItemSerialized {
        return {
            canvas: this.canvas.toJSON(),
        };
    }

    public static fromJSON(
        json: unknown,
        mountEl: HTMLElement,
        canvasMountEl: HTMLElement,
        settings: EditorSettings,
        group: ObjectGroup,
        paletteSets: Readonly<ColorPaletteSet[]>,
    ): ObjectGroupItem {
        const serialized = this.transformSerialized(json);

        return new ObjectGroupItem({
            canvas: PixelCanvas.fromJSON(serialized.canvas, canvasMountEl, settings, group, paletteSets),
            mountEl,
        });
    }

    public static transformSerialized(json: any): ObjectGroupItemSerialized {
        const context: SerializationContext = 'ObjectGroupItem';
        if (!json.canvas || typeof json.canvas !== 'object') {
            throw new SerializationTypeError(context, 'canvas', 'object', json.canvas);
        }

        return json;
    }
}
