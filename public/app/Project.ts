import { CodeGenerator } from './CodeGenerator.ts';
import { ColorPalette } from './ColorPalette.ts';
import type { ColorPaletteSet } from './ColorPaletteSet.ts';
import { copyToClipboard } from './copy.ts';
import { type EditorSettings, type UndoCheckpoint } from './Editor.ts';
import { type SerializationContext, SerializationTypeError } from './errors.ts';
import { EventEmitter } from './EventEmitter.ts';
import { formatFileSize, formatNumber, formatRelativeTime } from './formatting.ts';
import { GlobalEvents } from './GlobalEvents.ts';
import { Logger } from './Logger.ts';
import { Modal } from './Modal.ts';
import { isItemGroup } from './MultiSelect.ts';
import { ObjectGroup, type ObjectGroupSerialized } from './ObjectGroup.ts';
import { ObjectGroupItem } from './ObjectGroupItem.ts';
import { type CanvasOptions, PixelCanvas, type PixelDrawingEvent } from './canvas/PixelCanvas.ts';
import { Popover } from './Popover.ts';
import { isValidZoomLevel, zoomLevelLabel } from './utils-zoom.ts';
import {
    type AssemblyNumberFormatRadix,
    chars,
    clamp,
    CodeGenerationDetailLevel,
    type CodeGenerationOptions,
    type CodeGenerationOptionsBase,
    type Coordinate,
    type Dimensions,
    type DisplayModeColorIndex,
    type DisplayModeName,
    type ExportImageOptions,
    findCanvas,
    findElement,
    findInput,
    findOrDie,
    findSelect,
    findTemplateContent,
    formatAssemblyNumber,
    get2dContext,
    hasAddressLabel,
    type LoadedFile,
    parseTemplate,
    type PixelCanvasDrawStateContext,
    type PixelInfo,
    zeroPad
} from './utils.ts';

const tmpl = `
<div class="project-structure">
    <div class="project-structure-header section-item">
        <header class="project-name clamp-1"></header>
        <div class="project-controls">
            <button type="button"
                    class="btn btn-sm btn-success new-object-btn"
                    title="Create new group and object">
                <i class="fa-solid fa-add"></i>
            </button>
            <button type="button" class="btn btn-sm btn-tertiary overflow-btn" title="More actions&hellip;">
                <i class="fa-solid fa-ellipsis-h"></i>
            </button>
        </div>
    </div>
    <div class="project-stats section-item">
        <div class="object-counts"></div>
        <div class="loaded-file-link-container">
            <a href="#" class="loaded-file-link clamp-1"></a>
        </div>
    </div>
    <div class="project-objects" data-empty-drop-target="object-group"></div>
</div>
`;

const loadedFileInfoTmpl = `
<div class="loaded-file-info">
    <table class="form">
        <tr>
            <th>Filename:</th>
            <td class="filename"></td>
        </tr>
        <tr>
            <th>Size:</th>
            <td class="filesize has-info"></td>
        </tr>
        <tr>
            <th>Size (inflated):</th>
            <td class="filesize-inflated"></td>
        </tr>
        <tr>
            <th>Loaded:</th>
            <td><time class="has-info"></time></td>
        </tr>
    </table>
</div>
`;

const projectOverflowTmpl = `
<ul class="project-item-overflow list-unstyled dropdown-menu">
    <li class="dropdown-item"><a href="#" data-action="edit"><i class="fa-solid fa-fw fa-pencil icon"></i>Edit&hellip;</a></li>
    <li class="dropdown-item"><a href="#" data-action="add-object"><i class="fa-solid fa-fw fa-plus icon"></i>New object</a></li>
    <li class="dropdown-item"><a href="#" data-action="add-group"><i class="fa-solid fa-fw fa-square-plus icon"></i>New group</a></li>
    <li class="dropdown-item divider"></li>
    <li class="dropdown-item"><a href="#" data-action="save"><i class="fa-solid fa-fw fa-save icon"></i>Save&hellip;</a></li>
    <li class="dropdown-item">
        <div data-action="load" class="file-input-container dropdown-link">
            <i class="fa-solid fa-fw fa-folder-open icon"></i>
            Load&hellip;
            <input type="file" class="hidden-file-input" accept="application/json, application/gzip" />
        </div>
    </li>
    <li class="dropdown-item divider"></li>
    <li class="dropdown-item"><a href="#" data-action="export-asm"><i class="fa-solid fa-fw fa-code icon"></i>Export ASM&hellip;</a></li>
    <li class="dropdown-item"><a href="#" data-action="export-images"><i class="fa-solid fa-fw fa-images icon"></i>Export spritesheet&hellip;</a></li>
    <li class="dropdown-item divider"></li>
    <li class="dropdown-item"><a href="#" data-action="new"><i class="fa-solid fa-fw fa-folder-plus icon"></i>New project&hellip;</a></li>
</ul>
`;

const editProjectTmpl = `
<form class="form-vertical">
    <div class="form-row">
        <input class="project-name-input form-control" type="text" maxlength="50" minlength="1" required />
    </div>
    <div class="submit-container">
        <button type="submit" class="btn btn-primary">Save</button>
    </div>
</form>
`;

export interface ProjectSerialized {
    name: Project['name'];
    groups: ObjectGroupSerialized[];
    activeItemId?: string | null;
    codeGenOptions?: CodeGenerationOptions;
    exportImagesOptions?: ExportImageOptions;
}

export interface ProjectOptions {
    mountEl: HTMLElement;
    name: string;
    editorSettings: EditorSettings;
    groups?: ObjectGroup[];
    activeItem?: ObjectGroupItem | null;
    codeGenOptions?: CodeGenerationOptions | null;
    exportImagesOptions?: ExportImageOptions | null;
}

export type ProjectEventMap = {
    canvas_rotate: [ PixelCanvas ];
    canvas_activate: [ PixelCanvas | null ];
    pixel_hover: [ Coordinate, PixelInfo, PixelCanvas ];
    pixel_draw: [ PixelDrawingEvent, PixelCanvas ];
    pixel_draw_aggregate: [ Pick<PixelDrawingEvent, 'behavior'>, PixelCanvas ];
    canvas_reset: [ PixelCanvas ];
    canvas_reset_start: [ PixelCanvas ];
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
    action_add_object: [];
    action_load: [ File ];
    action_save: [ HTMLElement ];
    action_new_project: [];
};

export class Project extends EventEmitter<ProjectEventMap> {
    private activeItem: ObjectGroupItem | null;
    private name: string;
    private readonly $mountEl: HTMLElement;
    private readonly $el: HTMLElement;
    private readonly $stats: HTMLElement;
    private readonly $groupsContainer: HTMLElement;
    private initialized = false;
    private readonly logger: Logger;
    private readonly groups: ObjectGroup[];
    private codeGenOptions: CodeGenerationOptions;
    private exportImagesOptions: ExportImageOptions;
    private loadedFile: LoadedFile | null = null;
    private readonly editorSettings: EditorSettings;

    public constructor(options: ProjectOptions) {
        super();
        this.name = options.name;
        this.$mountEl = options.mountEl;
        this.$el = parseTemplate(tmpl);
        this.$groupsContainer = findElement(this.$el, '.project-objects');
        this.$stats = findElement(this.$el, '.project-stats');
        this.groups = options.groups || [];
        this.activeItem = options.activeItem || null;
        this.codeGenOptions = {
            addressOffset: 0xc00,
            addressOffsetRadix: 16,
            byteRadix: 2,
            commentLevel: CodeGenerationDetailLevel.Lots,
            header: true,
            indentChar: '    ',
            labelColon: false,
            object: true,
            paletteSet: true,
            prependGroup: false,
            ...options.codeGenOptions,
        };
        this.exportImagesOptions = options.exportImagesOptions || {
            backgroundColor: '#17181C',
            backgroundAlpha: 1,
            uncoloredStyle: 'transparent',
            orientation: 'horizontal',
            pixelSize: 'default',
            gap: 10,
            padding: 10,
        };
        this.editorSettings = options.editorSettings;

        this.logger = Logger.from(this);
    }

    private get eventNamespace(): string {
        return 'project';
    }

    private get canvases(): PixelCanvas[] {
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

    public getName(): string {
        return this.name;
    }

    public setName(newName: string) {
        newName = newName.trim() || 'My Project';
        if (this.name === newName) {
            return;
        }

        this.name = newName;
        this.updateNameUI();
    }

    public updateObjectCountsUI(): void {
        const objectCount = this.canvases.length;
        findElement(this.$stats, '.object-counts').innerText = `${this.groups.length}gr / ${objectCount}obj`;
    }

    public setLoadedFile(file: LoadedFile): void {
        this.loadedFile = file;
        findElement(this.$stats, '.loaded-file-link').innerText = file.name;
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
        this.updateObjectCountsUI();

        const $header = findElement(this.$el, '.project-structure-header');

        findElement($header, '.new-object-btn').addEventListener('click', () => {
            this.emit('action_add_object');
        });

        const $overflowContent = parseTemplate(projectOverflowTmpl);
        const overflowPopover = new Popover({
            content: $overflowContent,
            dropdown: true,
        });
        const $overflowBtn = findElement($header, '.project-controls .overflow-btn');

        const $editForm = parseTemplate(editProjectTmpl);
        const editPopover = new Popover({
            content: $editForm,
            title: 'Edit project',
            arrowAlign: 'left',
        });

        const $projectName = findElement($header, '.project-name');
        const $input = findInput($editForm, '.project-name-input');

        $editForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.setName($input.value);
            this.updateNameUI();
            editPopover.hide();
        });

        const $loadFileInput = findInput($overflowContent, 'input[type="file"]');
        $loadFileInput.addEventListener('change', async () => {
            const { files } = $loadFileInput;
            const file = files?.[0];
            if (!file) {
                return;
            }

            overflowPopover.hide();

            const filename = file.name;
            this.logger.info(`selected file ${filename} (${file.type}), ${formatFileSize(file.size)}`);
            this.emit('action_load', file);
        });

        $overflowContent.querySelectorAll('.dropdown-item a').forEach((anchor) => {
            anchor.addEventListener('click', (e) => {
                e.preventDefault();

                overflowPopover.hide();

                const action = anchor.getAttribute('data-action');
                switch (action) {
                    case 'edit':
                        $input.value = this.name;
                        editPopover.show($projectName);
                        $input.focus();
                        break;
                    case 'add-object':
                        this.emit('action_add_object');
                        break;
                    case 'add-group':
                        this.addGroup();
                        break;
                    case 'export-asm':
                        this.showExportASMModal(this.canvases);
                        break;
                    case 'export-images':
                        this.showExportImagesModal(this.canvases);
                        break;
                    case 'save':
                        this.emit('action_save', $projectName);
                        break;
                    // "load" is handled by the input[type="file"] event listener
                    case 'new':
                        this.emit('action_new_project');
                        break;
                    default:
                        this.logger.error(`unknown project overflow action: "${action}"`);
                        break;
                }
            });
        });

        $overflowBtn.addEventListener('click', () => {
            const canvases = this.groups
                .map(group => group.getCanvases())
                .reduce((arr, canvases) => arr.concat(canvases), []);

            // NOTE: this is duplicated in ObjectGroup
            // disable "Export ASM" option if it's not supported by anything in the project
            const $exportAsm = findElement($overflowContent, '[data-action="export-asm"]');
            $exportAsm.classList.toggle('disabled', !canvases.some(canvas => canvas.canExportToASM()));

            // disable "Export spritesheet" action if there are less than two objects
            const $exportSpritesheet = findElement($overflowContent, '[data-action="export-images"]');
            $exportSpritesheet.classList.toggle('disabled', canvases.length < 2);

            overflowPopover.show($overflowBtn);
        });

        const $loadedFileInfo = parseTemplate(loadedFileInfoTmpl);
        const popover = new Popover({
            title: 'Loaded file info',
            content: $loadedFileInfo,
        });
        const $link = findElement(this.$el, '.loaded-file-link');
        $link.addEventListener('click', (e) => {
            e.preventDefault();

            if (!this.loadedFile) {
                return;
            }

            findElement($loadedFileInfo, '.filename').innerText = this.loadedFile.name;

            const $size = findElement($loadedFileInfo, '.filesize');
            $size.setAttribute('title', formatNumber(this.loadedFile.size) + ' bytes');
            $size.innerText = formatFileSize(this.loadedFile.size);

            const $sizeInflated = findElement($loadedFileInfo, '.filesize-inflated');
            if (this.loadedFile.sizeInflated) {
                $sizeInflated.setAttribute('title', formatNumber(this.loadedFile.sizeInflated) + ' bytes');
                $sizeInflated.innerText = formatFileSize(this.loadedFile.sizeInflated);
            } else {
                $sizeInflated.innerText = 'n/a';
                $sizeInflated.removeAttribute('title');
            }
            $sizeInflated.classList.toggle('has-info', !!this.loadedFile.sizeInflated);

            const $time = findElement($loadedFileInfo, 'time');

            $time.setAttribute('datetime', this.loadedFile.loadTime.toISOString());
            $time.setAttribute('title', this.loadedFile.loadTime.toISOString());
            $time.innerText = formatRelativeTime(this.loadedFile.loadTime);

            popover.show($link);
        });

        GlobalEvents.instance.on(`draggable_reorder.${this.eventNamespace}`, (e) => {
            const { $item: $element, type } = e;
            if (type !== 'object-item') {
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

        GlobalEvents.instance.on(`draggable_reorder.${this.eventNamespace}`, (e) => {
            const { $item: $element, type } = e;
            if (type !== 'object-group') {
                return;
            }

            const groupId = $element.getAttribute('data-group-id');
            if (!groupId) {
                this.logger.error(`draggable element does not have data-group-id attribute`, $element);
                return;
            }

            const currentGroup = this.groups.find(group => group.id === groupId);
            if (!currentGroup) {
                this.logger.error(`dragged group "${groupId}" not found in project.groups`);
                return;
            }

            let sibling: ObjectGroup | null = null;
            if (e.sibling) {
                const siblingId = e.sibling.getAttribute('data-group-id');
                if (siblingId) {
                    sibling = this.groups.find(group => group.id === siblingId) || null;
                }
            }

            if (!sibling) {
                this.logger.debug(`dragged group has no sibling in drop target`, currentGroup);
                return;
            }

            const currentIndex = this.groups.indexOf(currentGroup);
            const newIndex = this.groups.indexOf(sibling);
            this.groups.splice(currentIndex, 1);
            this.groups.splice(newIndex, 0, currentGroup);

            this.logger.info('new group order:',
                this.groups.map(group => group.getName()).join(` ${chars.rightArrow} `));
        });

        this.$mountEl.appendChild(this.$el);

        this.initialized = true;
    }

    public destroy(): void {
        this.activeItem = null;
        while (this.groups.length) {
            const group = this.groups.pop()!;
            group.destroy();
        }
        GlobalEvents.instance.off(`*.${this.eventNamespace}`);
        this.$el.remove();
    }

    public getActiveCanvas(): PixelCanvas | null {
        return this.activeItem?.canvas || null;
    }

    public getObjectCountForPaletteSet(paletteSet: ColorPaletteSet): number {
        return this.groups
            .reduce((count, group) => count + group.getItems().reduce(
                (count, item) => count + (item.canvas.paletteSet === paletteSet ? 1 : 0),
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

        const exportId = 'export';
        const content = findTemplateContent(document, '#modal-content-export-form');

        const $modalContent = content.cloneNode(true) as ParentNode;
        const $warningContainer = findElement($modalContent, '.warning-container');
        const $codeTextarea = findOrDie($modalContent, '.export-code', node => node instanceof HTMLTextAreaElement);
        const $indentTabInput = findInput($modalContent, '#export-indent-tab');
        const $indent4SpacesInput = findInput($modalContent, '#export-indent-spaces-4');
        const $indent2SpacesInput = findInput($modalContent, '#export-indent-spaces-2');
        const $addressInput = findInput($modalContent, '#export-address');
        const $addressLabelInput = findInput($modalContent, '#export-address-label');
        const $byteRadixInput = findSelect($modalContent, '#export-byte-radix');
        const $labelColonInput = findInput($modalContent, '#export-label-colon');
        const $exportObjectInput = findInput($modalContent, '#export-object');
        const $exportHeaderInput = findInput($modalContent, '#export-header');
        const $exportPalettesInput = findInput($modalContent, '#export-palettes');
        const $detailLotsInput = findInput($modalContent, '#export-detail-level-lots');
        const $detailSomeInput = findInput($modalContent, '#export-detail-level-some');
        const $detailNoneInput = findInput($modalContent, '#export-detail-level-none');
        const $prependGroupInput = findInput($modalContent, '#export-prepend-group');

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
        $prependGroupInput.checked = this.codeGenOptions.prependGroup;

        const filterItems = PixelCanvas.getFilteredMultiSelectItems(
            canvases,
            findElement($modalContent, '.export-asm-object-filter'),
            () => generateCode(),
        );

        const generateCode = (): boolean => {
            const filteredCanvases = canvases.filter((canvas) =>
                filterItems.some(item => item.id === canvas.id && !isItemGroup(item) && item.selected));

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
                prependGroup: $prependGroupInput.checked,
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
            let warnings: string[] = [];

            if ($exportHeaderInput.checked) {
                filteredCanvases.forEach(canvas => genThunks.push(() => canvas.generateHeaderCode(options)));
            }
            if ($exportObjectInput.checked) {
                genThunks.push(() => {
                    const { code, warnings: lineWarnings } = CodeGenerator.generate(filteredCanvases, options);
                    warnings = lineWarnings;
                    return code;
                });
            }
            if ($exportPalettesInput.checked) {
                const paletteSetMap = filteredCanvases.reduce((map, canvas) => {
                    const paletteSet = canvas.paletteSet;
                    map[paletteSet.id] = paletteSet;
                    return map;
                }, {} as Record<string, ColorPaletteSet>);

                Object.values(paletteSetMap)
                    .forEach(paletteSet => genThunks.push(() => paletteSet.generateCode(options)));
            }

            try {
                $codeTextarea.value = genThunks.map(thunk => thunk()).join('\n\n');
            } catch (e) {
                Popover.toast({
                    content: `Code generation failure: ${(e as Error).message}`,
                    type: 'danger',
                });
                return false;
            }

            $warningContainer.style.display = warnings.length ? 'block' : 'none';
            if (warnings.length) {
                findElement($warningContainer, '.alert-message').innerText = warnings.join('; ');
            }
            return true;
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
            $prependGroupInput,
        ]
            .forEach((input) => {
                input.addEventListener('change', generateCode);
            });

        const titleName = canvases.length === 1 ?
            `"${canvases[0].getName()}"` :
            `multiple objects`;

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
            contentHtml: $modalContent,
        });

        this.logger.debug('showing export ASM modal');
        exportModal.show();
        exportModal.on('action', async (action) => {
            if (action.id === exportId) {
                this.logger.debug('exporting!');
                await copyToClipboard($codeTextarea.value, 'Copied code!');
            }
        });
    }

    /**
     * @param canvases If omitted, defaults to the active canvas
     */
    public showExportImagesModal(canvases?: PixelCanvas[]): void {
        if (!canvases) {
            const activeCanvas = this.getActiveCanvas();
            if (!activeCanvas) {
                return;
            }

            canvases = [ activeCanvas ];
        }

        if (!canvases.length) {
            return;
        }

        const $contentFragment = findTemplateContent(document, '#modal-content-export-images');
        const $modalContent = $contentFragment.cloneNode(true) as ParentNode;

        // this is necessary if you export after (e.g.) zooming: only the active canvas is updated
        // so if you export after a zoom, other canvases will be blank.
        // theoretically we could keep track of which canvases are out of sync with their render state, and then
        // only render those at this time. an optimization for another time, though.
        canvases.forEach(canvas => canvas.render());

        const $canvas = findCanvas($modalContent, 'canvas');
        const $info = findElement($modalContent, '.canvas-preview-info');

        const $bgColor = findInput($modalContent, '#export-images-bg');
        const $bgAlpha = findInput($modalContent, '#export-images-bg-alpha');
        const $uncolored = findSelect($modalContent, '#export-images-uncolored');
        const $orientation = findSelect($modalContent, '#export-images-orientation');
        const $gap = findInput($modalContent, '#export-images-gap');
        const $padding = findInput($modalContent, '#export-images-padding');
        const $pixelWidth = findInput($modalContent, '#export-images-pixel-width');
        const $pixelHeight = findInput($modalContent, '#export-images-pixel-height');

        // sync form inputs with previous options
        $bgColor.value = this.exportImagesOptions.backgroundColor;
        $bgAlpha.value = this.exportImagesOptions.backgroundAlpha.toString();
        $uncolored.value = this.exportImagesOptions.uncoloredStyle === 'default' ? 'default' : 'transparent';
        $orientation.value = this.exportImagesOptions.orientation === 'vertical' ? 'vertical' : 'horizontal';
        $gap.value = this.exportImagesOptions.gap.toString();
        $padding.value = canvases.length === 1 ? '0' : this.exportImagesOptions.padding.toString();
        $pixelWidth.value = this.exportImagesOptions.pixelSize === 'default' ? '' : this.exportImagesOptions.pixelSize.width.toString();
        $pixelHeight.value = this.exportImagesOptions.pixelSize === 'default' ? '' : this.exportImagesOptions.pixelSize.height.toString();

        $gap.disabled = canvases.length === 1;
        $orientation.disabled = canvases.length === 1;

        [
            $bgColor,
            $bgAlpha,
            $uncolored,
            $orientation,
            $gap,
            $padding,
            $pixelWidth,
            $pixelHeight,
        ].forEach(($input) => {
            $input.addEventListener('change', () => generateImages());
        });

        const filterItems = PixelCanvas.getFilteredMultiSelectItems(
            canvases,
            findElement($modalContent, '.export-asm-object-filter'),
            () => generateImages(),
        );

        const setInfo = (blob: { size: number } | null): void => {
            const size = blob?.size || 0;
            const zoomLabel = isValidZoomLevel(this.editorSettings.zoomLevel) ?
                zoomLevelLabel[this.editorSettings.zoomLevel] :
                this.editorSettings.zoomLevel.toString();
            $info.innerText = `${$canvas.width}${chars.times}${$canvas.height} ` +
                `${chars.interpunct} ${formatFileSize(size)} ` +
                `${chars.interpunct} zoom: ${zoomLabel}x`
            $info.setAttribute('title', `${size} bytes`);
        };

        const generateImages = (): void => {
            const originalPadding = this.exportImagesOptions.padding;

            const options = this.exportImagesOptions = {
                backgroundColor: $bgColor.value,
                backgroundAlpha: clamp(0, 1, Number($bgAlpha.value)),
                orientation: $orientation.value === 'vertical' ? 'vertical' : 'horizontal',
                pixelSize: $pixelWidth.value && $pixelHeight.value ?
                    { width: Number($pixelWidth.value), height: Number($pixelHeight.value) } :
                    'default',
                uncoloredStyle: $uncolored.value === 'default' ? 'default' : 'transparent',
                padding: clamp(0, 128, Number($padding.value)),
                gap: clamp(0, 128, Number($gap.value)),
            };
            const { orientation, gap, padding } = options;

            if (canvases.length === 1 && this.exportImagesOptions.padding === 0) {
                // if we're only exporting a single canvas, we manually set the padding to
                // 0, so we don't want to persist the overwritten value.
                this.exportImagesOptions.padding = originalPadding;
            }

            const byGroup: Record<ObjectGroup['id'], PixelCanvas[]> = {};

            const filteredCanvases = canvases.filter((canvas) =>
                filterItems.some(item => item.id === canvas.id && !isItemGroup(item) && item.selected));

            filteredCanvases.forEach((canvas) => {
                const key = canvas.getGroup().id;
                byGroup[key] = byGroup[key] || [];
                byGroup[key].push(canvas);
            });

            const groupedCanvases = Object.values(byGroup);

            const getScaled = (dimension: keyof Dimensions, canvas: PixelCanvas): number => {
                if (options.pixelSize === 'default') {
                    return canvas.getDisplayDimensions()[dimension];
                }

                const size = canvas.getDisplayDimensionsForPixelSize(options.pixelSize);
                return size[dimension];
            };

            const totalMax = groupedCanvases.reduce(
                (max, canvases) => Math.max(
                    max,
                    canvases.reduce((total, canvas) =>
                        total + getScaled(orientation === 'horizontal' ? 'width' : 'height', canvas),
                    0) + (gap * (canvases.length - 1))
                ),
                0,
            );

            const sumMax = groupedCanvases.reduce(
                (sum, canvases) => sum + canvases.reduce(
                    (max, canvas) => Math.max(max, getScaled(orientation === 'horizontal' ? 'height' : 'width', canvas)),
                    0,
                ), 0) + (gap * (groupedCanvases.length - 1));

            $canvas.width = (orientation === 'horizontal' ? totalMax : sumMax) + (padding * 2);
            $canvas.height = (orientation === 'horizontal' ? sumMax : totalMax) + (padding * 2);

            const ctx = get2dContext($canvas);
            ctx.fillStyle = options.backgroundColor + zeroPad(Math.round(options.backgroundAlpha * 255).toString(16), 2);
            ctx.fillRect(0, 0, $canvas.width, $canvas.height);

            let xOffset = padding;
            let yOffset = padding;

            groupedCanvases.forEach((canvases) => {
                canvases.forEach((canvas) => {
                    const actualWidth = getScaled('width', canvas);
                    const actualHeight = getScaled('height', canvas);

                    const isKangaroo = this.editorSettings.kangarooMode && canvas.supportsKangarooMode();
                    const shouldRenderBg = isKangaroo || options.uncoloredStyle !== 'transparent';

                    if (shouldRenderBg) {
                        canvas.drawBackgroundOnto(ctx, xOffset, yOffset, actualWidth, actualHeight);
                    }
                    canvas.drawImageOnto(ctx, xOffset, yOffset, actualWidth, actualHeight);

                    if (orientation === 'horizontal') {
                        xOffset += actualWidth + gap;
                    } else {
                        yOffset += actualHeight + gap;
                    }
                });

                const maxDimension = canvases.reduce((max, canvas) => Math.max(
                    max,
                    orientation === 'horizontal' ? getScaled('height', canvas) : getScaled('width', canvas)
                ), 0);

                if (options.orientation === 'horizontal') {
                    xOffset = padding;
                    yOffset += maxDimension + gap;
                } else {
                    xOffset += maxDimension + gap;
                    yOffset = padding;
                }
            });

            const maxSize = 256; // NOTE: this should match the .canvas-preview size in the CSS (minus the padding)
            const maxDimension = Math.max($canvas.width, $canvas.height);
            const scale = maxDimension <= maxSize ? 1 : maxSize / maxDimension;

            $canvas.style.width = ($canvas.width * scale) + 'px';
            $canvas.style.height = ($canvas.height * scale) + 'px';

            if ($canvas.width === 0 || $canvas.height === 0) {
                setInfo(null);
                return;
            }

            $canvas.toBlob(setInfo, 'image/png');
        };

        $canvas.addEventListener('click', () => downloadImage());

        const downloadImage = () => {
            generateImages();
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
        };

        const downloadId = 'download';
        const imageModal = Modal.create({
            type: 'default',
            title: `Export ${canvases.length === 1 && canvases[0] ? `"${canvases[0].getName()}"` : 'spritesheet'}`,
            actions: [
                'cancel',
                {
                    id: downloadId,
                    align: 'end',
                    labelHtml: '<i class="fa-solid fa-download"></i> Download',
                    type: 'primary',
                },
            ],
            contentHtml: $modalContent,
        });

        imageModal.on('action', (e) => {
            if (e.id !== downloadId) {
                return;
            }

            downloadImage();
        });

        generateImages();
        imageModal.show();
    }

    public addGroup(): ObjectGroup {
        const group = new ObjectGroup();
        this.logger.info(`adding new group ${group.getName()}`);

        this.wireUpGroup(group);
        this.groups.push(group);
        this.updateObjectCountsUI();
        this.emit('group_add', group);

        return group;
    }

    private wireUpGroup(group: ObjectGroup): void {
        group.init(this.$groupsContainer);

        group.on('item_delete', (item) => {
            this.updateObjectCountsUI();
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

        group.on('action_export_images', (items) => {
            this.showExportImagesModal(items.map(item => item.canvas));
        });

        group.on('item_activate', (activeItem) => {
            this.activateItem(activeItem);
        });

        group.on('item_clone', (e) => {
            const cloneGroup = e.newGroup ? this.addGroup() : e.original.canvas.getGroup();

            this.logger.info(`cloning ${e.original.name} into ${cloneGroup.getName()}`);
            const cloned = cloneGroup.cloneItem(e.original);

            this.wireUpCanvas(cloned.canvas);
            this.activateItem(cloned);
        });

        group.on('item_add', (item) => {
            this.updateObjectCountsUI();
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

            this.updateObjectCountsUI();
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

        this.logger.info(`creating new canvas and item`);
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
        canvas.on('reset_start', () => this.emit('canvas_reset_start', canvas));
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
        canvas.on('rotate', () => this.emit('canvas_rotate', canvas));
    }

    public updateNameUI(): void {
        const $name = findElement(this.$el, '.project-name');
        $name.innerText = this.name;
        $name.setAttribute('title', this.name);
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
        // TODO why forceRender here?
        this.groups.forEach(group => group.setZoomLevel(group === this.activeGroup));
    }

    public setShowGrid(): void {
        this.activeCanvas?.setShowGrid();
    }

    public setUncoloredPixelBehavior(): void {
        this.canvases.forEach(canvas => canvas.setUncoloredPixelBehavior());
        this.groups.forEach(group => group.updateAllThumbnailBackgrounds());
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

    private getFilteredItems(predicate: (canvas: PixelCanvas) => boolean): ObjectGroupItem[] {
        return this.groups
            .filter(group => group.getCanvases().some(predicate))
            .reduce((items, group) => items.concat(group.getItems()), [] as ObjectGroupItem[]);
    }

    private updateItemAndRenderCanvasByPredicate(predicate: (canvas: PixelCanvas) => boolean): void {
        this.getFilteredItems(predicate)
            .forEach((item) => {
                item.canvas.render();
                item.updateThumbnail();
                item.syncObjectDetailsUI();
            });
    }

    public setBackgroundColor(paletteSet: ColorPaletteSet): void {
        this.updateItemAndRenderCanvasByPredicate(canvas => canvas.paletteSet === paletteSet);
    }

    public updatePaletteColor(paletteSet: ColorPaletteSet, palette: ColorPalette): void {
        // NOTE: detecting which canvases are using a palette is annoying due to the
        // complexities of the display mode, so instead we just filter by palette set.
        // I mean, it's not THAT annoying given we already can fetch the colors for
        // a display mode+palette, but it seems wasteful to run that logic every time.
        // Another option is to actually cache the current display mode's colors on the
        // canvas, and then this would be free, but that might be some premature optimization.
        this.updateItemAndRenderCanvasByPredicate(canvas => canvas.paletteSet === paletteSet);
    }

    public updatePaletteSetUI(paletteSet: ColorPaletteSet): void {
        this.getFilteredItems(canvas => canvas.paletteSet === paletteSet)
            .forEach(item => item.syncObjectDetailsUI());
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

    public hasItems(): boolean {
        return this.groups.some(group => group.hasItems());
    }

    public toJSON(): ProjectSerialized {
        return {
            name: this.name,
            activeItemId: this.activeItem?.id || null,
            groups: this.groups.map(group => group.toJSON()),
            codeGenOptions: { ...this.codeGenOptions },
            exportImagesOptions: { ...this.exportImagesOptions },
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

        const groups = serialized.groups.map(group =>
            ObjectGroup.fromJSON(group, canvasMountEl, editorSettings, paletteSets)) || [];

        return new Project({
            mountEl,
            name: serialized.name,
            groups,
            codeGenOptions: serialized.codeGenOptions,
            exportImagesOptions: serialized.exportImagesOptions,
            editorSettings,
            activeItem: serialized.activeItemId ?
                groups
                    .find(group => group.getItems().find(item => item.id === String(serialized.activeItemId)))
                    ?.getItems()
                    .find(item => item.id === String(serialized.activeItemId)) || null :
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

        const logger = new Logger({ name: 'ProjectSerializer' });
        // if any of the code generation options are invalid just set to null, don't need to explode
        // just for that.
        if (typeof json.codeGenOptions === 'object' && json.codeGenOptions) {
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

        if (typeof json.exportImagesOptions === 'object' && json.exportImagesOptions) {
            const mappings: [ keyof ExportImageOptions, string ][] = [
                [ 'orientation', 'string' ],
                [ 'uncoloredStyle', 'string' ],
                [ 'backgroundAlpha', 'number' ],
                [ 'backgroundColor', 'string' ],
                [ 'gap', 'number' ],
                [ 'padding', 'number' ],
            ];

            for (const [ key, expectedType ] of mappings) {
                if (typeof json.exportImagesOptions[key] !== expectedType) {
                    logger.warn(`exportImagesOptions.${key} was expected to be a ${expectedType}, ` +
                        `got ${typeof json.exportImagesOptions[key]}`);
                    json.exportImagesOptions = null;
                    break;
                }
            }

            if (typeof json.exportImagesOptions.pixelSize !== 'object' && json.exportImagesOptions.pixelSize !== 'default') {
                logger.warn(`exportImagesOptions.pixelSize was not a valid value`);
                json.exportImagesOptions = null;
            }
        } else {
            json.exportImagesOptions = null;
        }

        return json;
    }
}
