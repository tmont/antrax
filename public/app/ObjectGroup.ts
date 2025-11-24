import type { ColorPalette } from './ColorPalette.ts';
import type { ColorPaletteSet } from './ColorPaletteSet.ts';
import type { Atari7800Color } from './colors.ts';
import type { EditorSettings } from './Editor.ts';
import { type SerializationContext, SerializationTypeError } from './errors.ts';
import { EventEmitter } from './EventEmitter.ts';
import { Logger } from './Logger.ts';
import { Modal } from './Modal.ts';
import { ObjectGroupItem, type ObjectGroupItemOptions, type ObjectGroupItemSerialized } from './ObjectGroupItem.ts';
import type { PixelCanvas } from './PixelCanvas.ts';
import { Popover } from './Popover.ts';
import {
    findElement,
    findInput,
    findOrDie,
    findSelect,
    findTemplateContent,
    generateId,
    get2dContext,
    parseTemplate,
    type SiblingInsertOrder
} from './utils.ts';

export interface ObjectGroupOptions {
    id?: ObjectGroup['id'];
    name?: string;
    items?: ObjectGroupItem[];
    paletteSet: ColorPaletteSet;
    mountEl: HTMLElement;
}

export interface ObjectGroupSerialized {
    id: string | number;
    name: ObjectGroup['name'];
    paletteSetId: string | number;
    items: ObjectGroupItemSerialized[];
}

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
    <div class="group-items" data-empty-drop-target="object-group"></div>
</div>
`;

const groupOverflowTmpl = `
<ul class="project-item-overflow list-unstyled dropdown-menu">
    <li class="dropdown-item"><a href="#" data-action="edit"><i class="fa-solid fa-fw fa-pencil icon"></i>Edit&hellip;</a></li>
    <li class="dropdown-item"><a href="#" data-action="animate"><i class="fa-solid fa-fw fa-film icon"></i>Animate&hellip;</a></li>
    <li class="dropdown-item divider"></li>
    <li class="dropdown-item"><a href="#" data-action="export-asm"><i class="fa-solid fa-fw fa-code icon"></i>Export ASM&hellip;</a></li>
    <li class="dropdown-item"><a href="#" data-action="export-images"><i class="fa-solid fa-fw fa-images icon"></i>Export spritesheet</a></li>
    <li class="dropdown-item divider"></li>
    <li class="dropdown-item"><a href="#" data-action="delete" class="text-danger"><i class="fa-solid fa-fw fa-trash icon"></i>Delete&hellip;</a></li>
</ul>
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

export type ObjectGroupEventMap = {
    action_export_asm: [ Readonly<ObjectGroupItem[]> ];
    name_change: [];
    item_activate: [ ObjectGroupItem ];
    item_clone: [{ original: ObjectGroupItem; cloned: ObjectGroupItem }];
    item_remove: [ ObjectGroupItem ];
    item_add: [ ObjectGroupItem ];
    item_delete: [ ObjectGroupItem ];
    delete: [];
}

export class ObjectGroup extends EventEmitter<ObjectGroupEventMap> {
    public readonly id: string;
    private name: string;
    private paletteSet: ColorPaletteSet;
    private readonly logger: Logger;
    private readonly $container: HTMLElement;
    public readonly $itemContainer: HTMLElement;
    private readonly $el: HTMLElement;
    private readonly items: ObjectGroupItem[];

    private static instanceCount = 0;

    public constructor(options: ObjectGroupOptions) {
        super();

        ObjectGroup.instanceCount++;
        this.id = options.id || generateId();
        this.name = options.name || `Group ${ObjectGroup.instanceCount}`;
        this.paletteSet = options.paletteSet;
        this.items = options.items || [];
        this.$container = options.mountEl;
        this.$el = parseTemplate(objectGroupTmpl);
        this.$itemContainer = findElement(this.$el, '.group-items');

        this.logger = Logger.from(this);
    }

    public getCanvases(): PixelCanvas[] {
        return this.items.map(item => item.canvas);
    }

    public getItems(): Readonly<ObjectGroupItem[]> {
        return this.items;
    }

    public hasItems(): boolean {
        return this.items.length > 0;
    }

    public getName(): string {
        return this.name;
    }

    public get activeItem(): ObjectGroupItem | null {
        return this.items.find(item => item.isActive) || null;
    }

    public setName(newName: string): void {
        newName = newName || `Group ${this.id}`;
        if (this.name === newName) {
            return;
        }

        this.name = newName;

        const nameEl = findElement(this.$el, `.group-name`);
        nameEl.innerText = this.name;
        this.emit('name_change');
    }

    public getPaletteSet(): ColorPaletteSet {
        return this.paletteSet;
    }

    public getBackgroundColor(): Readonly<Atari7800Color> {
        return this.paletteSet.getBackgroundColor();
    }

    public createItem(options: Omit<ObjectGroupItemOptions, 'mountEl'>): ObjectGroupItem {
        return new ObjectGroupItem({
            ...options,
            mountEl: this.$itemContainer,
        });
    }

    public addItem(
        item: ObjectGroupItem,
        sibling: ObjectGroupItem | null = null,
        order: SiblingInsertOrder | null = null,
    ): boolean {
        const currentIndex = this.items.indexOf(item);
        const alreadyInGroup = currentIndex !== -1;

        let newIndex = sibling ? this.items.indexOf(sibling) : -1;

        if (!alreadyInGroup) {
            if (newIndex === -1) {
                this.logger.info(`adding ${item.name} to end`);
                this.items.push(item);
            } else {
                if (newIndex !== -1 && order !== 'before') {
                    newIndex++;
                    sibling = this.items[newIndex] || null;
                }
                this.logger.info(`adding ${item.name} at index ${newIndex}`);
                this.items.splice(newIndex, 0, item);
            }

            this.wireUpItem(item, sibling);
            this.emit('item_add', item);
        } else {
            if (newIndex === -1) {
                this.logger.debug(`not doing anything to ${item.name}, already in group`);
            } else if (currentIndex !== newIndex) {
                this.logger.info(`moving ${item.name} from index ${currentIndex} to ${newIndex}`);
                this.items.splice(currentIndex, 1);
                this.items.splice(newIndex, 0, item);
            } else {
                this.logger.debug(`not doing anything to ${item.name}, already in correct position at index ${newIndex}`);
            }
        }

        this.logger.debug(`new item order:`, this.items.map(item => item.canvas.getName()).join(' → '));

        return true;
    }

    private wireUpItem(item: ObjectGroupItem, insertBefore: ObjectGroupItem | null = null): void {
        this.logger.debug(`wiring up item events for ${item.name}}`, insertBefore);

        item.init(insertBefore);

        // Since items can change between groups, and groups are generally just an artificial structuring
        // of items/canvases with no real logic, groups should not listen to events on items/canvases
        // (because the group that an object belongs to can change frequently). Instead, the project should
        // listen to events directly from the item and/or canvas.

        // Or not, and just call item.off() every time and item switches groups, and then rebind all the events...
        item.off();

        item.on('delete', () => {
            if (this.removeItemFromArray(item)) {
                this.emit('item_delete', item);
            }
        });

        item.on('action_clone', () => {
            this.logger.info(`cloning ${item.name}`);
            this.emit('item_clone', {
                cloned: this.cloneItem(item),
                original: item,
            });
        });
        item.on('action_export_asm', () => {
            this.emit('action_export_asm', [ item ]);
        });
        item.on('activate', () => {
            this.emit('item_activate', item);
        });
        item.on('canvas_group_change', () => {
            // this shouldn't really be necessary, but it will handle the case where a canvas
            // manually sets its own group instead of going through the project/group (i.e. how
            // the UI works). essentially, if canvas.setGroup() is called outside the normal way.
            if (this.items.indexOf(item) === -1) {
                this.logger.warn(`item ${item.name} had its group change but is not part of the group, adding`);
                this.addItem(item);
            }
        });
    }

    private removeItemFromArray(item: ObjectGroupItem): boolean {
        const index = this.items.indexOf(item);
        if (index === -1) {
            return false;
        }
        this.items.splice(index, 1);
        this.logger.info(`removed ${item.name} at index ${index}`);
        return true;
    }

    public moveItem(
        item: ObjectGroupItem,
        newGroup: ObjectGroup,
        sibling: ObjectGroupItem | null,
        order: SiblingInsertOrder | null,
    ): void {
        if (newGroup !== this && !this.removeItemFromArray(item)) {
            this.logger.warn(`trying to move item ${item.name} to new group, but it is not in group ${this.name}`);
        }

        // the order of these statements is important. adding the item removes the previous canvas event listeners,
        // so if you set the group before removing the listeners, the canvas.group_change event will cause the
        // group to re-add the item to its collection. which means both the old group and the new group
        // will have the item contained therein, which would be misfortunate.

        if (newGroup !== this) {
            this.logger.info(`moving ${item.name} to group ${newGroup.name}`);
            item.off();
        } else {
            this.logger.info(`re-ordering ${item.name} within the group`);
        }

        newGroup.addItem(item, sibling, order);
        item.setGroup(newGroup);
    }

    public deleteItem(item: ObjectGroupItem): boolean {
        this.logger.info(`deleting ${item.name}`);
        item.delete();
        this.emit('item_delete', item);
        return true;
    }

    public cloneItem(otherItem: ObjectGroupItem): ObjectGroupItem {
        const newItem = otherItem.clone();
        this.addItem(newItem, otherItem, 'after');
        return newItem;
    }

    public delete(): void {
        this.logger.info(`deleting`);
        const objects = this.items;
        while (objects.length) {
            this.deleteItem(objects.pop()!);
        }

        this.$el.remove();
        this.emit('delete');
    }

    public setActiveItem(activeItem: ObjectGroupItem | null): void {
        if (activeItem === null) {
            // important that we don't deactivate an item that was just activated. activation
            // by an ObjectGroupItem emits "activate" which kind of recursively goes through
            // here. a little wonky, but meh. what's a little potential infinite recursion
            // between friends?
            this.activeItem?.deactivate();
        }

        this.items.forEach((item) => {
            if (item === activeItem) {
                item.activate();
            } else {
                item.deactivate();
            }
        });
    }

    public destroy(): void {
        this.delete();
    }

    public init(): void {
        const $parent = this.$container;

        if (this.$el.parentNode === $parent) {
            return;
        }

        this.items.forEach(item => this.wireUpItem(item));

        const $group = this.$el;
        $group.setAttribute('data-group-id', this.id);
        $group.querySelector('.group-name')?.appendChild(document.createTextNode(this.name));
        $parent.appendChild($group);

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

        const paletteSets = [ this.paletteSet ];
        paletteSets.forEach((paletteSet) => {
            const option = document.createElement('option');
            option.value = paletteSet.id;
            option.innerText = paletteSet.getName();
            option.selected = paletteSet === this.paletteSet;
            $paletteSetSelect.options.add(option);
        });

        $editForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.setName($input.value);
            editPopover.hide();
        });

        $overflowContent.querySelectorAll('.dropdown-item a').forEach((anchor) => {
            anchor.addEventListener('click', (e) => {
                e.preventDefault();

                overflowPopover.hide();

                const action = anchor.getAttribute('data-action');
                switch (action) {
                    case 'edit':
                        $input.value = this.name
                        editPopover.show($groupName);
                        $input.focus();
                        break;
                    case 'delete': {
                        const count = this.items.length;
                        const modal = Modal.confirm(
                            {
                                title: `Delete ${this.name}`,
                                contentText: `Are you sure you want to delete this group` +
                                    (count === 1 ? ' and 1 object' : (count === 0 ? '' : ' and ' + count + ' objects')) +
                                    `? This cannot be undone.`,
                            },
                            () => this.delete(),
                        );

                        modal.show();
                        break;
                    }
                    case 'export-asm':
                        this.emit('action_export_asm', this.items);
                        break;
                    case 'export-images': {
                        const items = this.items;

                        // this is necessary if you export after (e.g.) zooming: only the active canvas is updated
                        // so if you export after a zoom, other canvases will be blank.
                        // i could keep track of which canvases are out of sync with their render state, and then
                        // only render those at this time. an optimization for another time, though.
                        // TODO
                        items.forEach(item => item.canvas.render());

                        // render each canvas onto a new canvas in a row
                        const $canvas = document.createElement('canvas');
                        const gap = 10;
                        const padding = 10;
                        const totalWidth = items.reduce((total, item) =>
                            total + item.canvas.getDisplayDimensions().width, 0) +
                                (gap * (items.length - 1));
                        const maxHeight = items.reduce((max, item) =>
                            Math.max(max, item.canvas.getDisplayDimensions().height), 0);

                        $canvas.width = totalWidth + (padding * 2);
                        $canvas.height = maxHeight + (padding * 2);

                        const ctx = get2dContext($canvas);
                        ctx.fillStyle = '#363636';
                        ctx.fillRect(0, 0, $canvas.width, $canvas.height);

                        let xOffset = padding;
                        items.forEach((item) => {
                            const canvas = item.canvas;
                            ctx.drawImage(canvas.getUnderlyingBackgroundCanvas(), xOffset, padding);
                            ctx.drawImage(canvas.getUnderlyingEditorCanvas(), xOffset, padding);
                            xOffset += canvas.getDisplayDimensions().width + gap;
                        });

                        $canvas.toBlob((blob) => {
                            if (!blob) {
                                Popover.toast({
                                    type: 'danger',
                                    content: `Failed to generate image data`,
                                });
                                return;
                            }

                            window.open(URL.createObjectURL(blob));
                        }, 'image/png');

                        break;
                    }
                    case 'animate': {
                        const canvases = this.items.map(item => item.canvas);
                        if (!canvases[0]) {
                            break;
                        }

                        // see comment above for why this is necessary
                        canvases.forEach(canvas => canvas.render());

                        let currentFrame = 0;
                        const content = findTemplateContent(document, '#modal-content-animate-form');
                        const $el = content.cloneNode(true) as ParentNode;
                        const $fpsInput = findInput($el, '#animate-fps');
                        const $preview = findOrDie($el, 'canvas', node => node instanceof HTMLCanvasElement);
                        const ctx = get2dContext($preview);

                        const firstCanvas = canvases[0];

                        const maxSize = 480;
                        const { width, height } = firstCanvas.getDisplayDimensions();
                        const maxDimension = Math.max(width, height);

                        const scale = maxDimension <= maxSize ? 1 : maxSize / maxDimension;

                        $preview.width = width * scale;
                        $preview.height = height * scale;

                        const $objectList = findElement($el, '.animate-form-object-list');
                        $objectList.innerHTML = '';
                        $objectList.style.maxWidth = `${$preview.width}px`;
                        canvases.forEach((canvas, i) => {
                            const $canvas = document.createElement('canvas');
                            $canvas.setAttribute('title', `[${i}] ${canvas.getName()}`);
                            canvas.copyImageToCanvas($canvas, 48);
                            $objectList.appendChild($canvas);
                        });

                        this.logger.debug(`animation preview set to ${$preview.width}x${$preview.height} (scale=${scale})`);

                        const maxFPS = Number($fpsInput.max) || 30;
                        const minFPS = Number($fpsInput.min) || 1;
                        const drawFrame = () => {
                            const canvas = canvases[currentFrame];

                            if (canvas) {
                                ctx.clearRect(0, 0, $preview.width, $preview.height);
                                ctx.drawImage(canvas.getUnderlyingBackgroundCanvas(), 0, 0, $preview.width, $preview.height);
                                ctx.drawImage(canvas.getUnderlyingEditorCanvas(), 0, 0, $preview.width, $preview.height);
                            }

                            let fps = Number($fpsInput.value) || 0;
                            fps = Math.min(maxFPS, Math.max(minFPS, fps));
                            $fpsInput.value = fps.toString();

                            currentFrame = (currentFrame + 1) % canvases.length;
                            const lastFrame = Date.now();
                            const waitMs = (1 / fps) * 1000;

                            const wait = () => {
                                if (Date.now() - lastFrame >= waitMs) {
                                    drawFrame();
                                    return;
                                }

                                window.requestAnimationFrame(wait);
                            };

                            wait();
                        };

                        const modal = Modal.create({
                            type: 'default',
                            title: `Animating ${this.name}`,
                            actions: 'close',
                            contentHtml: $el,
                        });

                        modal.show();
                        drawFrame();
                        $fpsInput.focus();

                        break;
                    }
                }
            });
        });

        $overflowBtn.addEventListener('click', () => {
            const canvases = this.items.map(item => item.canvas);

            // disable "Export ASM" option if it's not supported by anything in the group
            const $exportAsm = findElement($overflowContent, '[data-action="export-asm"]');
            $exportAsm.classList.toggle('disabled', !canvases.some(canvas => canvas.canExportToASM()));

            // disable "Export spritesheet" and "Animate" options if there are less than two objects
            const $exportSpritesheet = findElement($overflowContent, '[data-action="export-images"]');
            const $animate = findElement($overflowContent, '[data-action="animate"]');
            [ $exportSpritesheet, $animate ].forEach(($el) => {
                $el.classList.toggle('disabled', canvases.length < 2);
            });

            overflowPopover.show($overflowBtn);
        });

        const $collapsible = findElement($group, '.group-name-container');
        $collapsible.addEventListener('click', () => {
            $group.classList.toggle('closed');
        });

        this.items.forEach(item => item.init());
    }

    public updateAllThumbnails(): void {
        this.items.forEach(item => item.updateThumbnail());
    }

    public setZoomLevel(forceRender = true): void {
        this.items.forEach(item => item.canvas.setZoomLevel(forceRender));
    }

    public syncPaletteColors(palette: ColorPalette): void {
        this.items
            .filter(item => item.canvas.getColorPalette() === palette)
            .forEach(item => item.syncPaletteColors());
    }

    public toJSON(): ObjectGroupSerialized {
        return {
            id: this.id,
            name: this.name,
            paletteSetId: this.paletteSet.id,
            items: this.items.map(item => item.toJSON()),
        };
    }

    public static fromJSON(
        json: object,
        mountEl: HTMLElement,
        canvasMountEl: HTMLElement,
        settings: EditorSettings,
        paletteSets: Readonly<ColorPaletteSet[]>,
    ): ObjectGroup {
        const serialized = this.transformSerialized(json);

        const paletteSet = paletteSets.find(set => set.id === String(serialized.paletteSetId));
        if (!paletteSet) {
            throw new Error(`Cannot deserialize ObjectGroup, palette set with ID "${serialized.paletteSetId}" not found`);
        }

        const group = new ObjectGroup({
            id: String(serialized.id),
            name: serialized.name,
            paletteSet,
            mountEl,
        });

        const items = serialized.items.map(item =>
            ObjectGroupItem.fromJSON(item, group.$itemContainer, canvasMountEl, settings, group, paletteSets));

        items.forEach(item => group.addItem(item));
        return group;
    }

    public static transformSerialized(json: any): ObjectGroupSerialized {
        const context: SerializationContext = 'ObjectGroup';

        if (!json.id || (typeof json.id !== 'string' && typeof json.id !== 'number')) {
            throw new SerializationTypeError(context, 'id', 'non-empty string or number', json.id);
        }
        if (typeof json.name !== 'string') {
            throw new SerializationTypeError(context, 'name', 'string', json.name);
        }
        if (!json.paletteSetId || (typeof json.paletteSetId !== 'string' && typeof json.paletteSetId !== 'number')) {
            throw new SerializationTypeError(context, 'paletteSetId', 'non-empty string or number number', json.paletteSetId);
        }
        if (!Array.isArray(json.items) || !json.items.every((item: unknown) => typeof item === 'object')) {
            throw new SerializationTypeError(context, 'items', 'array of objects', json.items);
        }

        return json;
    }
}
