import { CodeGenerator } from './CodeGenerator.ts';
import { ColorPalette } from './ColorPalette.ts';
import type { ColorPaletteSet } from './ColorPaletteSet.ts';
import type { EditorSettings, UndoCheckpoint } from './Editor.ts';
import { type SerializationContext, SerializationTypeError } from './errors.ts';
import { EventEmitter } from './EventEmitter.ts';
import { GlobalEvents } from './GlobalEvents.ts';
import { Logger } from './Logger.ts';
import { Modal } from './Modal.ts';
import { ObjectGroup, type ObjectGroupSerialized } from './ObjectGroup.ts';
import { ObjectGroupItem } from './ObjectGroupItem.ts';
import { type CanvasOptions, PixelCanvas, type PixelDrawingEvent } from './PixelCanvas.ts';
import { Popover } from './Popover.ts';
import {
    type AssemblyNumberFormatRadix,
    CodeGenerationDetailLevel,
    type CodeGenerationOptions,
    type CodeGenerationOptionsBase,
    type Coordinate,
    type DisplayModeColorIndex,
    type DisplayModeName,
    findElement,
    findInput,
    findOrDie,
    findSelect,
    findTemplateContent,
    formatAssemblyNumber,
    hasAddressLabel,
    parseTemplate,
    type PixelCanvasDrawStateContext,
    type PixelInfo
} from './utils.ts';

export interface ProjectSerialized {
    name: Project['name'];
    groups: ObjectGroupSerialized[];
    activeItemId?: string | null;
    codeGenOptions?: CodeGenerationOptions;
}

export interface ProjectOptions {
    mountEl: HTMLElement;
    name: string;
    groups?: ObjectGroup[];
    activeItem?: ObjectGroupItem | null;
    codeGenOptions?: CodeGenerationOptions | null;
}

export type ProjectEventMap = {
    canvas_activate: [ PixelCanvas | null ];
    pixel_hover: [ Coordinate, PixelInfo, PixelCanvas ];
    pixel_draw: [ PixelDrawingEvent, PixelCanvas ];
    pixel_draw_aggregate: [ Pick<PixelDrawingEvent, 'behavior'>, PixelCanvas ];
    canvas_reset: [ PixelCanvas ];
    canvas_draw_state_change: [ Readonly<PixelCanvasDrawStateContext>, PixelCanvas ];
    active_object_name_change: [ PixelCanvas ];
    active_group_name_change: [ ObjectGroup ];
    draw_start: [ PixelCanvas ];
    pixel_dimensions_change: [ PixelCanvas ];
    canvas_dimensions_change: [ PixelCanvas ];
    display_mode_change: [ PixelCanvas ];
    canvas_palette_change: [ PixelCanvas ];
    canvas_palette_set_change: [ PixelCanvas ];
    canvas_active_color_change: [ PixelCanvas ];
    canvas_group_change: [ PixelCanvas ];
    group_action_add: [ ObjectGroup ];
    group_add: [ ObjectGroup ];
    group_remove: [ ObjectGroup ];
    item_add: [ ObjectGroup, ObjectGroupItem ];
    item_remove: [ ObjectGroup, ObjectGroupItem ];
};

export class Project extends EventEmitter<ProjectEventMap> {
    private activeItem: ObjectGroupItem | null;
    public name: string;
    private readonly $container: HTMLElement;
    private initialized = false;
    private readonly logger: Logger;
    private readonly groups: ObjectGroup[];
    private readonly $groupsContainer: HTMLElement;
    private codeGenOptions: CodeGenerationOptions;

    public constructor(options: ProjectOptions) {
        super();
        this.name = options.name;
        this.$container = options.mountEl;
        this.$groupsContainer = findElement(this.$container, '.project-objects');
        this.groups = options.groups || [];
        this.activeItem = options.activeItem || null;
        this.codeGenOptions = options.codeGenOptions || {
            addressOffset: 0xc00,
            addressOffsetRadix: 16,
            byteRadix: 2,
            commentLevel: CodeGenerationDetailLevel.Lots,
            header: true,
            indentChar: '    ',
            labelColon: false,
            object: true,
            paletteSet: true,
        };

        this.logger = Logger.from(this);
    }

    private get eventNamespace(): string {
        return 'project';
    }

    private get canvases(): Readonly<PixelCanvas[]> {
        return this.groups.reduce((canvases, group) => canvases.concat(group.getCanvases()), [] as PixelCanvas[]);
    }

    private get activeGroup(): ObjectGroup | null {
        return this.activeItem ?
            this.groups.find(group => group.getItems().some(item => item === this.activeItem)) || null :
            null;
    }

    private get activeCanvas(): PixelCanvas | null {
        return this.activeItem?.canvas || null;
    }

    public init(): void {
        if (this.initialized) {
            return;
        }

        this.groups.forEach(group => this.wireUpGroup(group));
        this.canvases.forEach(canvas => this.wireUpCanvas(canvas));

        if (this.activeItem) {
            this.activateItem(this.activeItem);
        } else if (this.groups[0]?.hasItems()) {
            // activate first item in first group
            this.activateItem(this.groups[0].getItems()[0]!);
        }

        this.updateNameUI();
        this.updateAllThumbnails();

        GlobalEvents.instance.on(`draggable_reorder.${this.eventNamespace}`, (e) => {
            const { $item: $element, type } = e;
            if (type !== 'object-group') {
                return;
            }

            const itemId = $element.getAttribute('data-item-id');
            if (!itemId) {
                this.logger.error(`draggable element does not have data-item-id attribute`, $element);
                return;
            }

            const currentGroup = this.groups.find(group => group.getItems().some(item => item.id === itemId));
            if (!currentGroup) {
                this.logger.error(`group not found with item ${itemId}`, this.groups);
                return;
            }
            this.logger.debug(`current group is ${currentGroup.getName()} (${currentGroup.id})`);
            const item = currentGroup?.getItems().find(item => item.id === itemId);
            if (!item) {
                this.logger.error(`draggable item ${itemId} not found in group ${currentGroup.getName()}`);
                return;
            }

            // change group for relevant canvas
            const $groupEl = $element.closest('[data-group-id]');
            const groupId = $groupEl?.getAttribute('data-group-id');
            if (!$groupEl || !groupId) {
                this.logger.error(`ancestor group element not found with data-group-id`);
                return;
            }

            let newGroup = this.groups.find(group => group.id === groupId);
            if (!newGroup) {
                this.logger.error(`group "${groupId}" exists in the UI but not in project.groups`);
                return;
            }

            this.logger.debug(`detected ancestor group as ${newGroup.getName()} (${newGroup.id})`);

            let sibling: ObjectGroupItem | null = null;
            if (e.sibling) {
                const siblingId = e.sibling.getAttribute('data-item-id');
                if (siblingId) {
                    sibling = newGroup.getItems().find(item => item.id === siblingId) || null;
                }
            }

            currentGroup.moveItem(item, newGroup, sibling, e.order);
        });

        this.initialized = true;
    }

    public destroy(): void {
        this.activeItem = null;
        while (this.groups.length) {
            const group = this.groups.pop()!;
            group.destroy();
        }
        GlobalEvents.instance.off(`*.${this.eventNamespace}`);
    }

    public getActiveCanvas(): PixelCanvas | null {
        return this.activeItem?.canvas || null;
    }

    public getObjectCountForPaletteSet(paletteSet: ColorPaletteSet): number {
        return this.groups
            .reduce((count, group) => count + group.getItems().reduce(
                (count, item) => count + (item.canvas.getColorPaletteSet() === paletteSet ? 1 : 0),
                0
            ), 0);
    }

    public activateItem(newActiveItem: ObjectGroupItem | null): void {
        if (newActiveItem) {
            this.logger.debug(`activating item ${newActiveItem.name}`);
        } else {
            this.logger.debug('deactivating all items');
        }

        this.activeItem = newActiveItem;
        this.groups.forEach(group => group.setActiveItem(newActiveItem));
        this.updateActiveObjectInfo();

        this.emit('canvas_activate', this.activeItem?.canvas || null);
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
        const firstGroup = firstCanvas.getGroup();

        // can only export multiple canvases if they are all the same group (since each
        // group can have a different palette set). this should not be possible to achieve
        // using the UI.
        canvases = canvases.filter(canvas => canvas.getGroup() === firstGroup);

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

        // sync form inputs with previous options
        $indentTabInput.checked = this.codeGenOptions.indentChar === '\t';
        $indent4SpacesInput.checked = this.codeGenOptions.indentChar === '    ';
        $indent2SpacesInput.checked = this.codeGenOptions.indentChar === '  ';
        $addressInput.value = hasAddressLabel(this.codeGenOptions) ?
            this.codeGenOptions.addressLabel :
            formatAssemblyNumber(this.codeGenOptions.addressOffset, 16);
        $addressLabelInput.checked = hasAddressLabel(this.codeGenOptions);
        $byteRadixInput.value = this.codeGenOptions.byteRadix.toString();
        $labelColonInput.checked = this.codeGenOptions.labelColon;
        $exportObjectInput.checked = this.codeGenOptions.object;
        $exportHeaderInput.checked = this.codeGenOptions.header;
        $exportPalettesInput.checked = this.codeGenOptions.paletteSet;
        $detailLotsInput.checked = this.codeGenOptions.commentLevel === CodeGenerationDetailLevel.Lots;
        $detailSomeInput.checked = this.codeGenOptions.commentLevel === CodeGenerationDetailLevel.Some;
        $detailNoneInput.checked = this.codeGenOptions.commentLevel === CodeGenerationDetailLevel.None;

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
                paletteSet: $exportPalettesInput.checked,
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

            this.codeGenOptions = options;

            const genThunks: Array<() => string> = [];

            if ($exportHeaderInput.checked) {
                canvases.forEach(canvas => genThunks.push(() => canvas.generateHeaderCode(options)));
            }
            if ($exportObjectInput.checked) {
                genThunks.push(() => CodeGenerator.generate(canvases, options));
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

        const titleName = canvases.length === 1 ? firstCanvas.getName() : `all in ${firstCanvas.getGroup().getName()}`;

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

    public addGroup(): ObjectGroup {
        const group = new ObjectGroup({
            mountEl: this.$groupsContainer,
        });

        this.wireUpGroup(group);
        this.groups.push(group);
        this.emit('group_add', group);

        return group;
    }

    private wireUpGroup(group: ObjectGroup): void {
        group.init();

        group.on('item_delete', (item) => {
            if (this.activeItem === item) {
                this.activateItem(null);
            }
        });

        group.on('item_remove', (item) => {
            this.emit('item_remove', group, item);
        });

        group.on('action_add', () => {
            this.emit('group_action_add', group);
        });

        group.on('action_export_asm', (items) => {
            this.showExportASMModal(items.map(item => item.canvas));
        });

        group.on('item_activate', (activeItem) => {
            this.activateItem(activeItem);
        });

        group.on('item_clone', (e) => {
            this.wireUpCanvas(e.cloned.canvas);
            this.activateItem(e.cloned);
        });

        group.on('item_add', (item) => {
            this.emit('item_add', group, item);
        });

        group.on('name_change', () => {
            if (group === this.activeGroup) {
                this.emit('active_group_name_change', group);
            }
        });

        group.on('delete', () => {
            group.off();
            const index = this.groups.indexOf(group);
            if (index !== -1) {
                this.groups.splice(index, 1);
                this.logger.info(`deleted group ${group.getName()} at index ${index}`);
            }

            this.emit('group_remove', group);
        });
    }

    public createObjectInNewGroup(options: Omit<CanvasOptions, 'group' | 'palette'>): ObjectGroupItem {
        const group = this.addGroup();

        return this.createObject({
            ...options,
            group,
        });
    }

    public createObject(options: Omit<CanvasOptions, 'palette'>): ObjectGroupItem {
        const group = options.group;
        const paletteSet = options.paletteSet;
        const defaultColorPalette = paletteSet.getPalettes()[0];
        if (!defaultColorPalette) {
            throw new Error(`Could not find default color palette in ColorPaletteSet{${paletteSet.id}}`);
        }

        const canvas = new PixelCanvas({
            ...options,
            paletteSet,
            palette: defaultColorPalette,
        });

        const item = group.createItem({
            canvas,
        });

        group.addItem(item);

        this.wireUpCanvas(canvas);
        this.activateItem(item);
        return item;
    }

    private wireUpCanvas(canvas: PixelCanvas): void {
        canvas.on('pixel_draw', (...args) => {
            this.emit('pixel_draw', ...args, canvas);
        });
        canvas.on('pixel_draw_aggregate', (...args) => {
            this.emit('pixel_draw_aggregate', ...args, canvas);
        });
        canvas.on('pixel_draw', (...args) => {
            this.emit('pixel_draw', ...args, canvas);
        });
        canvas.on('pixel_draw_aggregate', (e) => {
            this.emit('pixel_draw_aggregate', e, canvas);
        });
        canvas.on('pixel_hover', (...args) => {
            this.emit('pixel_hover', ...args, canvas);
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
        canvas.on('palette_set_change', () => {
            this.emit('canvas_palette_set_change', canvas);
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
        canvas.on('group_change', () => {
            this.emit('canvas_group_change', canvas);
        });
        canvas.on('name_change', () => {
            if (this.activeCanvas === canvas) {
                this.emit('active_object_name_change', canvas);
            }
        });
        canvas.on('draw_state_change', (newState) => {
            this.emit('canvas_draw_state_change', newState, canvas);
        });
    }

    public exportActiveCanvasToImage(): void {
        this.activeItem?.exportCanvasToImage();
    }

    public updateNameUI(): void {
        findElement(this.$container, '.project-name').innerText = this.name;
    }

    public updateActiveObjectInfo(): void {
        this.activeItem?.updateObjectInfo();
    }

    /**
     * This is explicit because inactive canvases aren't shown, but the thumbnails are,
     * so if something changes (like a palette color change) then we might need to update
     * thumbnails other than the active one.
     */
    public updateAllThumbnails(): void {
        this.groups.forEach(group => group.updateAllThumbnails());
    }

    public zoomTo(): void {
        this.groups.forEach(group => group.setZoomLevel(group === this.activeGroup));
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

    public setActiveColor(colorValue: DisplayModeColorIndex): void {
        this.activeCanvas?.setActiveColor(colorValue);
    }

    public setColorPalette(palette: ColorPalette): void {
        this.activeCanvas?.setColorPalette(palette);
        this.updateActiveObjectInfo();
    }

    private updateItemAndRenderCanvasByPredicate(predicate: (canvas: PixelCanvas) => boolean): void {
        this.groups
            .filter(group => group.getCanvases().some(predicate))
            .reduce((items, group) => items.concat(group.getItems()), [] as ObjectGroupItem[])
            .forEach((item) => {
                item.canvas.render();
                item.updateObjectInfo();
            });
    }

    public setBackgroundColor(paletteSet: ColorPaletteSet): void {
        this.updateItemAndRenderCanvasByPredicate(canvas => canvas.getColorPaletteSet() === paletteSet);
    }

    public updatePaletteColor(paletteSet: ColorPaletteSet, palette: ColorPalette): void {
        // NOTE: detecting which canvases are using a palette is annoying due to the
        // complexities of the display mode, so instead we just filter by palette set.
        // I mean, it's not THAT annoying given we already can fetch the colors for
        // a display mode+palette, but it seems wasteful to run that logic every time.
        // Another option is to actually cache the current display mode's colors on the
        // canvas, and then this would be free, but that might be some premature optimization.
        this.updateItemAndRenderCanvasByPredicate(canvas => canvas.getColorPaletteSet() === paletteSet);
    }

    public updateKangarooMode(): void {
        this.updateItemAndRenderCanvasByPredicate(canvas => canvas.supportsKangarooMode());
    }

    public applyCheckpoint(undoCanvas: PixelCanvas, checkpoint: UndoCheckpoint): void {
        const canvas = this.canvases.find(canvas => canvas === undoCanvas);
        if (!canvas) {
            this.logger.warn(`cannot undo because PixelCanvas{${undoCanvas.id}} is not in this project`);
            return;
        }

        const { width, height } = checkpoint.canvasDimensions;
        this.setCanvasDimensions(width, height);
        canvas.setPixelData(checkpoint.pixelData);
    }

    public toJSON(): ProjectSerialized {
        return {
            name: this.name,
            activeItemId: this.activeItem?.id || null,
            groups: this.groups.map(group => group.toJSON()),
            codeGenOptions: { ...this.codeGenOptions },
        };
    }

    public static fromJSON(
        json: object,
        mountEl: HTMLElement,
        canvasMountEl: HTMLElement,
        editorSettings: EditorSettings,
        paletteSets: Readonly<ColorPaletteSet[]>,
    ): Project {
        const serialized = this.transformSerialized(json);

        const groupMountEl = findElement(mountEl, '.project-objects')
        const groups = serialized.groups.map(group =>
            ObjectGroup.fromJSON(group, groupMountEl, canvasMountEl, editorSettings, paletteSets)) || [];

        return new Project({
            mountEl,
            name: serialized.name,
            groups,
            codeGenOptions: serialized.codeGenOptions,
            activeItem: serialized.activeItemId ?
                groups
                    .find(group => group.getItems().find(item => item.id === String(serialized.activeItemId)))
                    ?.getItems().find(item => item.id === String(serialized.activeItemId)) || null
                    :
                null,
        });
    }

    public static transformSerialized(json: any): ProjectSerialized {
        const context: SerializationContext = 'Project';

        if (typeof json.name !== 'string') {
            throw new SerializationTypeError(context, 'name', 'string', json.name);
        }

        if (Array.isArray(json.canvases)) {
            // legacy: canvases contain the group instead of the other way around, so we
            // need to shove the corresponding canvas into the group.items.canvas property

            const groupCache: Record<string, ObjectGroupSerialized> = {};
            json.canvases.forEach((canvas: any) => {
                const groupObj = canvas?.group;
                if (!groupObj) {
                    return;
                }

                delete canvas.group;
                const id = String(groupObj.id);

                if (!groupCache[id]) {
                    groupCache[id] = {
                        id,
                        items: [],
                        name: String(groupObj.name || '[untitled]'),
                    };
                }

                groupCache[id].items.push({
                    canvas,
                });
            });

            json.groups = Object.keys(groupCache).map(id => groupCache[id]);
        }

        if (!Array.isArray(json.groups) || !json.groups.every((obj: unknown) => typeof obj === 'object')) {
            throw new SerializationTypeError(context, 'groups', 'array of objects', json.groups);
        }

        // if any of the code generation options are invalid just set to null, don't need to explode
        // just for that.
        if (typeof json.codeGenOptions === 'object' && json.codeGenOptions) {
            const logger = new Logger({ name: 'ProjectSerializer' });
            const mappings: [ keyof CodeGenerationOptions, string ][] = [
                [ 'object', 'boolean' ],
                [ 'labelColon', 'boolean' ],
                [ 'indentChar', 'string' ],
                [ 'header', 'boolean' ],
                [ 'commentLevel', 'number' ],
                [ 'byteRadix', 'number' ],
                [ 'addressOffsetRadix', 'number' ],
            ];

            for (const [ key, expectedType ] of mappings) {
                if (typeof json.codeGenOptions[key] !== expectedType) {
                    logger.warn(`codeGenOptions.${key} was expected to be a ${expectedType}, ` +
                        `got ${typeof json.codeGenOptions[key]}`);
                    json.codeGenOptions = null;
                    break;
                }
            }
        } else {
            json.codeGenOptions = null;
        }

        return json;
    }
}
