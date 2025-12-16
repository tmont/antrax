import type { ColorPaletteSet } from './ColorPaletteSet.ts';
import { copyToClipboard } from './copy.ts';
import type { EditorSettings } from './Editor.ts';
import { type SerializationContext, SerializationTypeError } from './errors.ts';
import { EventEmitter } from './EventEmitter.ts';
import { Logger } from './Logger.ts';
import { Modal } from './Modal.ts';
import type { ObjectGroup } from './ObjectGroup.ts';
import { PixelCanvas, type PixelCanvasSerialized } from './canvas/PixelCanvas.ts';
import { Popover } from './Popover.ts';
import {
    chars,
    findCanvas,
    findElement,
    findInput,
    findOrDie,
    findTemplateContent,
    hasMessage,
    parseTemplate,
    setTextAndTitle
} from './utils.ts';

const objectItemTmpl = `
<div class="project-item" data-drag-item="object-item">
    <div class="project-list-item">
        <div class="object-thumbnail">
            <canvas class="bg" width="32" height="32"></canvas>
            <canvas class="main" width="32" height="32"></canvas>
        </div>
        <div class="item-name clamp-1"></div>
        <div class="item-controls">
            <button type="button" class="btn btn-sm btn-tertiary overflow-btn" title="More actions&hellip;">
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
                    <div>
                        <span class="palette-set-name"></span>/<span class="palette-name"></span>
                    </div>
                    <div class="palette-color-list"></div>
                </div>
            </div>
            <div class="no-display-mode-details">
                <div class="palette-set-name"></div>
                <div class="palette-set-preview"></div>
            </div>
        </div>
    </div>
</div>
`;

const objectOverflowTmpl = `
<ul class="project-item-overflow list-unstyled dropdown-menu">
    <li class="dropdown-item"><a href="#" data-action="edit"><i class="fa-solid fa-fw fa-pencil icon"></i>Edit&hellip;</a></li>
    <li class="dropdown-item"><a href="#" data-action="clone"><i class="fa-regular fa-fw fa-clone icon"></i>Clone</a></li>
    <li class="dropdown-item"><a href="#" data-action="clone-group"><i class="fa-solid fa-fw fa-clone icon"></i>Clone into new group</a></li>
    <li class="dropdown-item"><a href="#" data-action="clear"><i class="fa-solid fa-fw fa-eraser icon"></i>Clear</a></li>
    <li class="dropdown-item divider"></li>
    <li class="dropdown-item"><a href="#" data-action="export-asm"><i class="fa-solid fa-fw fa-code icon"></i>Export ASM&hellip;</a></li>
    <li class="dropdown-item"><a href="#" data-action="export-image"><i class="fa-solid fa-fw fa-image icon"></i>Export image&hellip;</a></li>
    <li class="dropdown-item"><a href="#" data-action="debug"><i class="fa-solid fa-fw fa-terminal icon"></i>Debug&hellip;</a></li>
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
    action_clone: [ { newGroup: boolean } ];
    action_export_asm: [];
    action_export_image: [];
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
    private readonly $thumbnailBg: HTMLCanvasElement;
    private readonly $thumbnailMain: HTMLCanvasElement;
    private initialized = false;

    public constructor(options: ObjectGroupItemOptions) {
        super();

        this.canvas = options.canvas;
        this.$container = options.mountEl;
        this.$el = parseTemplate(objectItemTmpl);
        this.$el.setAttribute('data-item-id', this.id);
        this.$thumbnailBg = findCanvas(this.$el, '.object-thumbnail canvas.bg');
        this.$thumbnailMain = findCanvas(this.$el, '.object-thumbnail canvas.main');

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
        setTextAndTitle(findElement(this.$el, '.item-name'),  this.canvasName);
    }

    public setGroup(newGroup: ObjectGroup): void {
        this.canvas.setGroup(newGroup);
    }

    public init(insertBefore: ObjectGroupItem | null = null): void {
        if (this.initialized) {
            return;
        }

        this.logger.debug('initializing');

        const sibling = insertBefore ? this.$container.querySelector(`[data-item-id="${insertBefore.id}"]`) : null;

        if (!sibling || !insertBefore) {
            if (insertBefore) {
                this.logger.warn(`sibling element not found: ${insertBefore.name}`);
            }
            this.logger.debug(`appending to end`);
            this.$container.appendChild(this.$el);
        } else {
            this.logger.debug(`inserting before ${insertBefore.name}`);
            sibling.insertAdjacentElement('beforebegin', this.$el);
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

            if (this.$el.parentNode !== this.$container) {
                this.logger.error('group changed, but element does not have correct parent!', this);
            }

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
                        this.emit('action_clone', { newGroup: false });
                        break;
                    case 'clone-group':
                        this.emit('action_clone', { newGroup: true });
                        break;
                    case 'export-image':
                        this.emit('action_export_image');
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
                    case 'debug': {
                        const $tmpl = findTemplateContent(document, '#modal-content-object-debug');

                        const $content = findElement($tmpl.cloneNode(true) as typeof $tmpl, '.object-debug-form');

                        const $input = findOrDie($content, '.code', node => node instanceof HTMLTextAreaElement);
                        $input.value = JSON.stringify(this.canvas.clonePixelData(), null, '  ');

                        const modal = Modal.create({
                            contentHtml: $content,
                            title: `Debug info for ${this.canvasName}`,
                            actions: [
                                'cancel',
                                {
                                    type: 'primary',
                                    align: 'start',
                                    labelHtml: `<i class="fa-solid fa-copy"></i> Copy`,
                                    id: 'copy',
                                },
                                {
                                    type: 'danger',
                                    align: 'end',
                                    labelHtml: `<i class="fa-solid fa-exclamation-triangle"></i> Save`,
                                    id: 'save',
                                },
                            ],
                        });

                        modal.show();

                        modal.on('action', async (action) => {
                            if (action.id === 'save') {
                                let json: any;
                                try {
                                    json = JSON.parse($input.value);
                                } catch (e) {
                                    const message = hasMessage(e) ? e.message : '';
                                    Popover.toast({
                                        type: 'danger',
                                        content: `Failed to parse JSON${message ? ': ' + message : ''}`,
                                    });
                                    return;
                                }

                                this.logger.warn(`overriding canvas pixel data from user input`);
                                this.canvas.setPixelData(json);
                                modal.destroy();
                            } else if (action.id === 'copy') {
                                await copyToClipboard($input.value, 'Copied pixel data!');
                            }
                        });
                        break;
                    }
                }

                overflowPopover.hide();
            });
        });

        $overflowBtn.addEventListener('click', () => {
            // disable "Export ASM" option if it's not supported
            const $exportAsm = findElement($overflowContent, '[data-action="export-asm"]');
            $exportAsm.classList.toggle('disabled', !canvas.canExportToASM());
            overflowPopover.show($overflowBtn);
        });

        this.setName(this.canvasName, true);

        this.syncObjectDetailsUI();

        // necessary for making the thumbnails render properly, even though not all the canvases
        // are actually visible
        canvas.render();

        this.initialized = true;
    }

    public updateThumbnail(): void {
        this.updateThumbnailBg();
        this.updateThumbnailMain();
    }

    public updateThumbnailMain(): void {
        this.canvas.copyImageToCanvas(this.$thumbnailMain, 20, 'main');
    }

    public updateThumbnailBg(): void {
        this.canvas.copyImageToCanvas(this.$thumbnailBg, 20, 'bg');
    }

    public updateObjectInfo(): void {
        this.updateThumbnail();
        this.syncObjectDetailsUI();
    }

    public syncObjectDetailsUI(): void {
        this.logger.info(`updating details UI`);
        const canvas = this.canvas;
        const $el = this.$el;
        const { width, height } = canvas.getDimensions();

        findElement($el, '.canvas-size').innerText = `${width}${chars.times}${height}`;

        const displayMode = canvas.displayMode;
        findElement($el, '.display-mode-name').innerText = displayMode.name;

        const $paletteName = findElement($el, '.palette-name');
        const $colorList = findElement($el, '.palette-color-list');
        const $displayModeDetails = findElement($el, '.display-mode-details');
        const $noDisplayModeDetails = findElement($el, '.no-display-mode-details');

        $displayModeDetails.style.display = displayMode.hasSinglePalette ? '' : 'none';
        $noDisplayModeDetails.style.display = displayMode.hasSinglePalette ? 'none' : '';
        const paletteSet = canvas.paletteSet;
        $el.querySelectorAll('.palette-set-name').forEach(($setName) => {
            ($setName as HTMLElement).innerText = paletteSet.getShortName();
            $setName.setAttribute('title', `Palette set: ${paletteSet.getName()}`);
        });

        const $preview = findElement($noDisplayModeDetails, '.palette-set-preview');
        $preview.style.backgroundImage = paletteSet.getGradientCSS();
        $preview.setAttribute('title', `Palette set: ${paletteSet.getName()}`);

        $colorList.innerHTML = '';

        if (displayMode.hasSinglePalette) {
            const palette = canvas.palette;
            $paletteName.innerText = palette.name;

            palette.colors.forEach((color) => {
                const $swatch = document.createElement('div');
                $swatch.classList.add('color-swatch');
                $swatch.style.backgroundColor = color.hex;
                $colorList.appendChild($swatch);
            });
        } else {
            $paletteName.innerHTML = '';
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

    public clone(otherGroup?: ObjectGroup): ObjectGroupItem {
        return new ObjectGroupItem({
            canvas: this.canvas.clone(),
            mountEl: otherGroup?.$itemContainer || this.$container,
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
