import { ColorPaletteSet } from './ColorPaletteSet.ts';
import { ColorPaletteSetCollection, type ColorPaletteSetCollectionSerialized } from './ColorPaletteSetCollection.ts';
import DisplayMode from './DisplayMode.ts';
import { type SerializationContext, SerializationTypeError } from './errors.ts';
import { Logger } from './Logger.ts';
import { Modal } from './Modal.ts';
import { ObjectGroup } from './ObjectGroup.ts';
import { type CanvasOptions, PixelCanvas, type PixelDrawingBehavior } from './PixelCanvas.ts';
import { Popover } from './Popover.ts';
import { Project, type ProjectSerialized } from './Project.ts';
import {
    chars,
    type Dimensions,
    type DisplayModeColorIndex,
    type DisplayModeColorValue,
    type DisplayModeName,
    type DrawMode,
    findButton,
    findElement,
    findInput,
    findOrDie,
    findSelect,
    findTemplateContent,
    getColorValueCombinedLabel,
    hasMessage,
    isDrawMode,
    isLeftMouseButton,
    nope,
    parseTemplate,
    type PixelInfo,
    type Rect,
    setTextAndTitle
} from './utils.ts';

export interface CopiedCanvasData {
    pixelData: PixelInfo[][];
    canvas: PixelCanvas;
    displayMode: DisplayMode;
}

export interface EditorSettings {
    showGrid: boolean;
    zoomLevel: number;
    activeColorPaletteSet: ColorPaletteSet;
    uncoloredPixelBehavior: 'color0' | 'background';
    kangarooMode: boolean;
    drawMode: DrawMode;
}

export interface EditorSettingsSerialized extends Pick<EditorSettings, 'showGrid' | 'zoomLevel'> {
    activeColorPaletteSetId: string | number;
    uncoloredPixelBehavior?: EditorSettings['uncoloredPixelBehavior'] | 'transparent'; // "transparent" is legacy
    kangarooMode?: EditorSettings['kangarooMode'];
    drawMode?: EditorSettings['drawMode'];
}

export interface EditorOptions {
    settings?: EditorSettings;
    mountEl: HTMLElement;
    paletteSets: ColorPaletteSet[];
}

export interface EditorSerialized {
    settings: EditorSettingsSerialized;
    project: ProjectSerialized | null;
    paletteSetCollection: ColorPaletteSetCollectionSerialized;
}

const colorItemTmpl = `
<div class="color-item">
    <div class="label"></div>
    <div class="color selectable"></div>
</div>
`;

const saveAsFormTmpl = `
<form class="form-vertical" style="width: 16em">
    <div class="form-row">
        <input class="filename-input form-control"
               value="antrax.json.gz"
               type="text"
               minlength="1"
               maxlength="100"
               placeholder="antrax.json.gz" />
    </div>
    <div class="submit-container">
        <button type="submit" class="btn btn-primary">Save</button>
    </div>
</form>
`;

export interface UndoCheckpoint {
    pixelData: PixelCanvas['pixelData'];
    canvasDimensions: Dimensions;
}

export interface UndoContext {
    stack: UndoCheckpoint[];
    current: number;
}

interface SelectionButtons {
    readonly $copy: HTMLButtonElement;
    readonly $crop: HTMLButtonElement;
    readonly $delete: HTMLButtonElement;
    readonly $rotate: HTMLButtonElement;
    readonly $flipV: HTMLButtonElement;
    readonly $flipH: HTMLButtonElement;
    readonly $paste: HTMLButtonElement;
}

type CopyBuffer = CopiedCanvasData[];

export class Editor {
    private project: Project | null = null;
    private readonly logger: Logger;
    private readonly $el: HTMLElement;
    private readonly $gutterBottom: HTMLElement;
    private readonly $gutterTop: HTMLElement;
    private readonly $gridInput: HTMLInputElement;
    private readonly $uncolorPixelInput: HTMLInputElement;
    private readonly $zoomValue: HTMLElement;
    private readonly $pixelWidthInput: HTMLInputElement;
    private readonly $pixelHeightInput: HTMLInputElement;
    private readonly $canvasWidthInput: HTMLInputElement;
    private readonly $canvasHeightInput: HTMLInputElement;
    private readonly $canvasCoordinates: HTMLElement;
    private readonly $selectionSize: HTMLElement;
    private readonly $activeGroupName: HTMLElement;
    private readonly $activeObjectName: HTMLElement;
    private readonly $canvasArea: HTMLElement;
    private readonly $projectControls: HTMLElement;
    private readonly $canvasSidebar: HTMLElement;
    private readonly $displayModeSelect: HTMLSelectElement;
    private readonly $kangarooModeInput: HTMLInputElement;
    private readonly selectionButtons: SelectionButtons;
    private initialized = false;
    private settings: EditorSettings;
    private readonly copyBuffer: CopyBuffer = [];

    private paletteSets: ColorPaletteSetCollection;
    private undoContext: Record<PixelCanvas['id'], UndoContext> = {};

    public get name(): string {
        return 'Editor';
    }

    public constructor(options: EditorOptions) {
        this.$el = options.mountEl;

        this.logger = Logger.from(this);

        this.$gutterBottom = findElement(this.$el, '.canvas-gutter.bottom');
        this.$gutterTop = findElement(this.$el, '.canvas-gutter.top');
        this.$canvasArea = findElement(this.$el, '.canvas-area');
        this.$gridInput = findInput(this.$gutterBottom, '#option-show-grid');
        this.$uncolorPixelInput = findInput(this.$gutterBottom, '#option-uncolored-pixel-behavior');
        this.$kangarooModeInput = findInput(this.$gutterBottom, '#option-kangaroo-mode');
        this.$zoomValue = findElement(this.$gutterBottom, '.zoom-level-value');
        this.$pixelWidthInput = findInput(this.$gutterBottom, '#option-pixel-width');
        this.$pixelHeightInput = findInput(this.$gutterBottom, '#option-pixel-height');
        this.$canvasWidthInput = findInput(this.$gutterBottom, '#option-canvas-width');
        this.$canvasHeightInput = findInput(this.$gutterBottom, '#option-canvas-height');
        this.$canvasCoordinates = findElement(this.$gutterTop, '.current-coordinates');
        this.$selectionSize = findElement(this.$gutterTop, '.selection-size');
        this.$activeGroupName = findElement(this.$gutterTop, '.breadcrumb .active-group-name');
        this.$activeObjectName = findElement(this.$gutterTop, '.breadcrumb .active-object-name');
        this.$projectControls = findElement(this.$el, '.project-controls');
        this.$canvasSidebar = findElement(this.$el, '.canvas-sidebar');
        this.$displayModeSelect = findSelect(this.$canvasSidebar, '#display-mode-select');

        const btnSelector = (action: string) => `.canvas-selection-controls [data-action="${action}"]`;
        this.selectionButtons = {
            $copy: findButton(this.$gutterTop, btnSelector('copy')),
            $crop: findButton(this.$gutterTop, btnSelector('crop')),
            $delete: findButton(this.$gutterTop, btnSelector('delete')),
            $rotate: findButton(this.$gutterTop, btnSelector('rotate')),
            $flipH: findButton(this.$gutterTop, btnSelector('flip-h')),
            $flipV: findButton(this.$gutterTop, btnSelector('flip-v')),
            $paste: findButton(this.$gutterTop, btnSelector('paste')),
        };

        const defaultPaletteSet = options.paletteSets[0];
        if (!defaultPaletteSet) {
            throw new Error(`paletteSets cannot be empty`);
        }

        this.settings = options.settings || {
            showGrid: false,
            zoomLevel: 3,
            activeColorPaletteSet: defaultPaletteSet,
            uncoloredPixelBehavior: 'color0',
            kangarooMode: false,
            drawMode: 'draw',
        };

        this.paletteSets = new ColorPaletteSetCollection({
            paletteSets: options.paletteSets,
            editorSettings: this.settings,
        });

        this.setPaletteSets(this.paletteSets);
        this.onPaletteSetChanged();
    }

    private get activeCanvas(): PixelCanvas | null {
        return this.project?.getActiveCanvas() || null;
    }

    public createProject(name: Project['name']): Project {
        return new Project({
            name,
            mountEl: findElement(this.$el, '.project-structure'),
            editorSettings: this.settings,
        });
    }

    public setProject(project: Project): void {
        // disable events on previously active project
        this.project?.off();

        let undoTimeoutId: number | null = null;

        this.project = project;
        this.project.off();
        this.project.on('canvas_activate', (activeCanvas) => {
            this.logger.debug(`canvas "${activeCanvas?.getName()}" activated`);
            this.setGroupName(activeCanvas?.getGroup());
            this.setObjectName(activeCanvas);

            this.$canvasCoordinates.innerText = `0,0`;

            if (activeCanvas) {
                this.onPixelDimensionsChanged(activeCanvas);
                this.onCanvasDimensionsChanged(activeCanvas);
                this.onDisplayModeChanged(activeCanvas);
                this.onCanvasPaletteChanged(activeCanvas);

                // among other things, this helps cloned items have an initial undo state that
                // is not blank
                this.pushUndoItem(activeCanvas);
            } else {
                // onDisplayModeChanged also calls syncSelectionActions so we didn't need this
                // on the other side of the conditional here.
                this.syncSelectionActions(null);
            }

            this.syncDisplayModeControl();

            const $displayModeSelect = findSelect(this.$canvasSidebar, '#display-mode-select');
            $displayModeSelect.value = activeCanvas?.getDisplayMode()?.name || 'none';

            if (activeCanvas) {
                findElement(this.$canvasSidebar, '.no-selected-object').style.display = 'none';
                findElement(this.$canvasSidebar, '.has-selected-object').style.display = 'block';
            } else {
                findElement(this.$canvasSidebar, '.no-selected-object').style.display = '';
                findElement(this.$canvasSidebar, '.has-selected-object').style.display = '';
            }
        });

        const onCanvasPixelsChanged = (e: { behavior: PixelDrawingBehavior }, canvas: PixelCanvas) => {
            if (e.behavior === 'user') {
                if (undoTimeoutId) {
                    window.clearTimeout(undoTimeoutId);
                    undoTimeoutId = null;
                }

                undoTimeoutId = window.setTimeout(() => this.pushUndoItem(canvas), 250);
            }

            this.syncDisplayModeControl();
        };

        this.project.on('pixel_draw', onCanvasPixelsChanged);
        this.project.on('pixel_draw_aggregate', onCanvasPixelsChanged);
        this.project.on('pixel_hover', (coordinate, _, canvas) => {
            this.$canvasCoordinates.innerText = `${coordinate.x}, ${coordinate.y}`;
            this.syncSelectionSize();
        });
        this.project.on('canvas_reset', (canvas) => {
            this.syncDisplayModeControl(false);
            this.pushUndoItem(canvas);
        });
        this.project.on('draw_start', (canvas) => {
            this.pushUndoItem(canvas);
        });
        this.project.on('active_object_name_change', (activeCanvas) => {
            this.setObjectName(activeCanvas);
        });
        this.project.on('active_group_name_change', (group) => {
            this.setGroupName(group);
        });
        this.project.on('pixel_dimensions_change', (activeCanvas) => {
            this.onPixelDimensionsChanged(activeCanvas);
        });
        this.project.on('canvas_dimensions_change', (activeCanvas) => {
            this.onCanvasDimensionsChanged(activeCanvas);
        });
        this.project.on('display_mode_change', (activeCanvas) => {
            this.onDisplayModeChanged(activeCanvas);
        });
        this.project.on('canvas_palette_change', (activeCanvas) => {
            this.onCanvasPaletteChanged(activeCanvas);
        });
        this.project.on('canvas_active_color_change', (activeCanvas) => {
            this.setActiveColor(activeCanvas.getActiveColor());
        });
        this.project.on('canvas_group_change', (canvas) => {
            if (canvas !== this.activeCanvas) {
                return;
            }

            this.setGroupName(canvas.getGroup());
        });
        this.project.on('group_action_add', (group) => {
            this.project?.createObject({
                ...this.getDefaultCanvasOptions(),
                group,
            });
        });
        this.project.on('canvas_draw_state_change', (_, canvas) => {
            this.syncSelectionActions(canvas);
            this.syncSelectionSize();
        });
    }

    private syncSelectionSize(): void {
        const canvas = this.project?.getActiveCanvas();
        const { width, height } = canvas?.getCurrentSelection() || { width: 0, height: 0 };
        this.$selectionSize.innerText = `${width}${chars.times}${height}`;
    }

    public pushUndoItem(canvas: PixelCanvas): void {
        let undoContext = this.undoContext[canvas.id];
        if (!undoContext) {
            undoContext = this.undoContext[canvas.id] = {
                current: -1,
                stack: [],
            };
        }

        // if current is not pointing to the most item on the stack, remove all elements
        // to the end of the stack
        if (undoContext.current !== undoContext.stack.length - 1) {
            this.logger.info(`slicing undo stack since pointer was not at end ` +
                `(${undoContext.current} vs. ${undoContext.stack.length - 1})`);
            undoContext.stack = undoContext.stack.slice(0, undoContext.current + 1);
        }

        const pixelData = canvas.clonePixelData();

        const topOfStack = undoContext.stack[undoContext.stack.length - 1];
        const currentHash = PixelCanvas.generateHashWithDimensions(pixelData, canvas.getDimensions());
        const topHash = topOfStack ?
            PixelCanvas.generateHashWithDimensions(topOfStack.pixelData, topOfStack.canvasDimensions) :
            null;

        if (topOfStack && currentHash === topHash) {
            // top of stack has the same state, don't want consecutive undo items to be identical
            this.logger.info(`undo stack has identical data, not pushing`);
            return;
        }

        undoContext.stack.push({
            canvasDimensions: canvas.getDimensions(),
            pixelData,
        });

        while (undoContext.stack.length > 250) {
            undoContext.stack.shift();
        }

        undoContext.current = undoContext.stack.length - 1;
        this.logger.debug(`pushing onto undo stack ${undoContext.current}/${undoContext.stack.length - 1}`);
    }

    private setGroupName(group?: ObjectGroup | null): void {
        setTextAndTitle(this.$activeGroupName, group?.getName() || 'n/a');
    }

    private setObjectName(canvas?: PixelCanvas | null): void {
        setTextAndTitle(this.$activeObjectName, canvas?.getName() || 'n/a');
    }

    private syncDisplayModeControl(hasData?: boolean): void {
        const canvas = this.activeCanvas;
        hasData = typeof hasData === 'undefined' ? canvas?.hasData() || false : hasData;
        this.$displayModeSelect.disabled = hasData;
    }

    private onPaletteSetChanged(): void {
        const set = this.settings.activeColorPaletteSet;
        const $select = findSelect(this.$canvasSidebar, '.canvas-palette-select');
        while ($select.options.length) {
            $select.remove(0);
        }

        set.getPalettes().forEach((palette) => {
            const $option = document.createElement('option');
            $option.value = palette.id.toString();
            $option.innerText = palette.name;
            $select.add($option, null);
        });

        this.logger.debug(`updated palette <select> with palettes from ColorPaletteSet{${set.id}}`);
    }

    private onDisplayModeChanged(canvas: PixelCanvas): void {
        const displayMode = canvas.getDisplayMode();
        this.logger.debug('display mode changed to', displayMode.name);

        const defaultPixelDimensions = canvas.getPixelDimensions();
        const { width, height } = displayMode.getPixelDimensions(defaultPixelDimensions);
        this.project?.setPixelDimensions(width, height);

        const canvasWidthMultiple = displayMode.pixelsPerByte;
        if (canvasWidthMultiple > 0) {
            const { width } = canvas.getDimensions();
            if (width > displayMode.maxWidth) {
                this.project?.setCanvasDimensions(displayMode.maxWidth, null);
            } else if (width % canvasWidthMultiple !== 0) {
                const clampedWidth = width + (canvasWidthMultiple - (width % canvasWidthMultiple));
                this.project?.setCanvasDimensions(clampedWidth, null);
            }
        }

        this.$pixelWidthInput.disabled = displayMode.isFixedPixelSize;
        this.$pixelHeightInput.disabled = displayMode.isFixedPixelSize;

        this.$canvasWidthInput.max = isFinite(displayMode.maxWidth) ? displayMode.maxWidth.toString() : '256';
        this.$canvasWidthInput.step = displayMode.pixelsPerByte > 0 ? displayMode.pixelsPerByte.toString() : '1';
        this.$canvasWidthInput.min = displayMode.pixelsPerByte > 0 ? displayMode.pixelsPerByte.toString() : '1';

        const $paletteSelect = findSelect(this.$canvasSidebar, '.canvas-palette-select');
        $paletteSelect.disabled = displayMode.name === 'none';

        this.settings.activeColorPaletteSet.setActivePalette(
            displayMode.hasSinglePalette ? canvas.getColorPalette() : null,
        );

        this.$kangarooModeInput.disabled = !canvas.supportsKangarooMode();

        // forcefully toggle out of Kangaroo mode if the display does not support it
        if (this.settings.kangarooMode && !canvas.supportsKangarooMode()) {
            this.logger.debug(`setting kangarooMode=false because not supported for displayMode=${displayMode.name}`);
            this.settings.kangarooMode = false;
            this.onKangarooModeChanged();
        }

        this.syncCanvasSidebarColors();
        this.syncSelectionActions(canvas); // some actions are disabled based on the display mode (e.g. horizontal flip)

        // certain display modes have a different color0, which is used as the background, so
        // we need to update it (e.g. 320D in Kangaroo mode)
        canvas.renderBg();
    }

    private syncCanvasSidebarColors(): void {
        const canvas = this.activeCanvas;
        if (!canvas) {
            this.logger.info(`syncCanvasSidebarColors: no canvas, doing nothing`);
            return;
        }

        const displayMode = canvas.getDisplayMode();
        this.logger.debug(`syncing canvas sidebar colors (displayMode=${displayMode.name})`);

        const palette = canvas.getColorPalette();
        const paletteSet = this.paletteSets.getPaletteSets().find(set => set.getPalettes().some(p => p === palette));
        if (!paletteSet) {
            throw new Error(`Could not find PaletteSet for ColorPalette{${palette.id}}`);
        }

        const colors = canvas.getColors();

        const $paletteList = findElement(this.$canvasSidebar, '.canvas-palette-colors');
        $paletteList.innerHTML = '';
        const $paletteNotAllowed = findElement(this.$canvasSidebar, '.palette-not-allowed');
        const $paletteSelect = findElement(this.$canvasSidebar, '.canvas-palette-select');

        if (displayMode.hasSinglePalette) {
            $paletteNotAllowed.style.display = '';
            $paletteList.style.display = '';
            $paletteSelect.style.display = '';
            palette.colors.forEach((color) => {
                const $swatch = document.createElement('div');
                $swatch.classList.add('color-swatch');
                $swatch.style.backgroundColor = color.hex;
                $paletteList.appendChild($swatch);
            });
        } else {
            this.logger.debug(`hiding palette <select> and color list`);
            $paletteList.style.display = 'none';
            $paletteSelect.style.display = 'none';
            $paletteNotAllowed.style.display = 'block';
        }

        const $colorList = findElement(this.$canvasSidebar, '.color-list');
        $colorList.innerHTML = '';

        const $colorItem = parseTemplate(colorItemTmpl);
        const activeColor = canvas.getActiveColor();

        colors.forEach((colorValue: DisplayModeColorValue, colorModeIndex) => {
            const $item = $colorItem.cloneNode(true) as HTMLElement;
            $item.setAttribute('data-color-value', colorModeIndex.toString());
            if (activeColor === colorModeIndex) {
                $item.classList.add('active');
            }

            findElement($item, '.label').innerText = getColorValueCombinedLabel(colorValue);

            colorValue.colors.forEach((color) => {
                const $swatch = document.createElement('div');
                $swatch.classList.add('color-swatch');
                $swatch.style.backgroundColor = color.value === 'transparent' ?
                    'transparent' :
                    (
                        color.value === 'background' ?
                            this.settings.activeColorPaletteSet.getBackgroundColor().hex :
                            color.value.palette.getColorAt(color.value.index).hex
                    );

                if (color.value === 'transparent') {
                    $swatch.classList.add('transparent-checkerboard');
                }

                findElement($item, '.color').appendChild($swatch);
            });

            $item.addEventListener('click', () => {
                this.setActiveColor(colorModeIndex);
            });

            $colorList.appendChild($item);
        });
    }

    private onCanvasPaletteChanged(canvas: PixelCanvas): void {
        const palette = canvas.getColorPalette();
        const $select = findSelect(this.$canvasSidebar, '.canvas-palette-select');
        const index = Array.from($select.options).findIndex(option => option.value === palette.id);
        if (index === -1) {
            const options = Array.from($select.options).map(option => option.value);
            throw new Error(`Palette{${palette.id}} not found in .canvas-palette-select <option>: "${options.join('", "')}"`);
        }

        // update palette <select> and swatch list
        $select.selectedIndex = index;

        // update color list
        this.syncCanvasSidebarColors();

        this.settings.activeColorPaletteSet.setActivePalette(canvas.getDisplayMode().hasSinglePalette ? palette : null);
    }

    private onCanvasDimensionsChanged(canvas: PixelCanvas): void {
        if (canvas !== this.activeCanvas) {
            return;
        }

        const { width, height } = canvas.getDimensions();
        this.$canvasWidthInput.value = width.toString();
        this.$canvasHeightInput.value = height.toString();
    }

    private onPixelDimensionsChanged(canvas: PixelCanvas): void {
        if (canvas !== this.activeCanvas) {
            return;
        }

        const { width, height } = canvas.getPixelDimensions();
        this.$pixelWidthInput.value = width.toString();
        this.$pixelHeightInput.value = height.toString();
    }

    private setDrawMode(newMode: DrawMode, force = false): void {
        if (!force && this.settings.drawMode === newMode) {
            return;
        }

        const canvas = this.activeCanvas;
        if (!canvas) {
            return;
        }

        this.settings.drawMode = newMode;

        this.$canvasSidebar.querySelectorAll('[data-mode]').forEach((el) => {
            const drawMode = el.getAttribute('data-mode');
            if (!isDrawMode(drawMode)) {
                return;
            }

            el.classList.toggle('active', drawMode === newMode);
            el.classList.toggle('btn-primary', drawMode === newMode);
            el.classList.toggle('btn-tertiary', drawMode !== newMode);
        });

        this.logger.debug(`drawMode set to ${this.settings.drawMode}`);

        canvas.resetDrawContext();
    }

    public setPaletteSets(paletteSets: ColorPaletteSetCollection): void {
        this.paletteSets.off();

        this.paletteSets = paletteSets;
        this.paletteSets.on('color_change', (paletteSet, palette, color, index) => {
            this.project?.updatePaletteColor(palette, index);
            this.syncCanvasSidebarColors();
        });
        this.paletteSets.on('bg_select', (paletteSet, color) => {
            this.project?.setBackgroundColor(color);
            this.syncCanvasSidebarColors();
        });
    }

    private setActiveColor(colorValue: DisplayModeColorIndex): void {
        const canvas = this.activeCanvas;
        if (!canvas) {
            return;
        }

        const colorCount = canvas.getColors().length;
        colorValue = ((colorValue % colorCount) + colorCount) % colorCount;

        this.logger.info(`active color set to ${colorValue}`);
        this.project?.setActiveColor(colorValue);

        const $colorList = findElement(this.$canvasSidebar, '.color-list');
        $colorList.querySelectorAll('[data-color-value]').forEach((el) => {
            el.classList.remove('active');
            if (el.getAttribute('data-color-value') === colorValue.toString()) {
                el.classList.add('active');
            }
        });
    }

    public updateZoomLevelUI(): void {
        this.$zoomValue.innerText = this.settings.zoomLevel + 'x';
    }

    public updateGridUI(): void {
        this.$gridInput.checked = this.settings.showGrid;
    }

    public updateKangarooModeUI(): void {
        this.$kangarooModeInput.checked = this.settings.kangarooMode;
        this.$uncolorPixelInput.disabled = this.settings.kangarooMode;
        this.syncCanvasSidebarColors();
    }

    private onKangarooModeChanged(): void {
        this.updateKangarooModeUI();
        const newPixelBehavior: EditorSettings['uncoloredPixelBehavior'] = 'color0';
        if (this.settings.uncoloredPixelBehavior !== newPixelBehavior) {
            this.settings.uncoloredPixelBehavior = newPixelBehavior;
            this.onUncoloredPixelBehaviorChanged();
        }
        this.project?.updateKangarooMode();
    }

    private updateUncolorPixelBehaviorUI(): void {
        this.$uncolorPixelInput.checked = this.settings.uncoloredPixelBehavior === 'color0';
    }

    private onUncoloredPixelBehaviorChanged(): void {
        this.updateUncolorPixelBehaviorUI();
        this.project?.setUncoloredPixelBehavior();
    }

    public init(): void {
        if (this.initialized) {
            return;
        }

        if (!this.project) {
            throw new Error(`cannot be initialized without a project, maybe...`);
        }

        this.paletteSets.init();
        this.project.init();

        this.$el.querySelectorAll('.new-object-btn').forEach((newObjBtn) => {
            newObjBtn.addEventListener('click', () => {
                if (!this.project) {
                    return;
                }

                this.project.createObjectInNewGroup(this.getDefaultCanvasOptions());
            });
        });

        const $saveBtn = findElement(this.$projectControls, '.save-btn');
        $saveBtn.addEventListener('click', () => {
            const $form = parseTemplate(saveAsFormTmpl);
            if (!($form instanceof HTMLFormElement)) {
                throw new Error(`saveAsFormTmpl is misconfigured, no <form> element`);
            }

            const popover = new Popover({
                content: $form,
            });

            popover.show($saveBtn);

            const $filenameInput = findInput($form, 'input.filename-input');

            // TODO set this to project name once that's actually a thing that can be renamed
            const entropy = new Date().toISOString()
                .replace(/T/, '_')
                .replace(/\..*$/, '')
                .replace(/\W/g, '')

            const prefix = `antrax_${entropy}`;
            $filenameInput.value = `${prefix}.json.gz`;

            $filenameInput.focus();
            $filenameInput.setSelectionRange(0, prefix.length);
            $form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.save($filenameInput.value.trim());
                popover.hide();
            });
        });

        const $loadFileInput = findInput(this.$projectControls, '.load-btn input[type="file"]');
        $loadFileInput.addEventListener('change', async () => {
            const { files } = $loadFileInput;
            const file = files?.[0];
            if (!file) {
                return;
            }

            const filename = file.name;
            const sizeKb = (file.size / 1024).toFixed(1);
            this.logger.info(`selected file ${filename} (${file.type}), ${sizeKb}KB`);

            // normally it should be application/gzip, but sometimes it's application/x-gzip, so now
            // we just look for "gzip" anywhere and assume it's gzipped
            if (!/gzip/.test(file.type)) {
                // assume it's JSON
                this.load(await file.text(), filename);
            } else {
                this.load(await file.arrayBuffer(), filename);
            }
        });

        const canvasContainer = findElement(this.$el, '.canvas-container');
        let panning = false;
        let panningOrigin = { x: 0, y: 0 };

        // need to keep track of this when zooming by key press instead of mousewheel
        const currentMouseCoords = {
            x: 0,
            y: 0,
        };

        const adjustCanvasPositionRelativeToCursor = (
            canvas: PixelCanvas,
            clientX: number,
            clientY: number,
            oldWidth: number,
            oldHeight: number,
        ): void => {
            // shift canvas so that the pixel you're hovering over remains under your cursor even
            // at the new canvas size. if the cursor is not over the canvas, maintain the exact
            // distance from the nearest edge.

            const parent = this.$canvasArea.offsetParent;
            if (!parent) {
                return;
            }

            const canvasRect = canvas.getHTMLRect();
            const { top: containerTop, left: containerLeft } = parent.getBoundingClientRect();

            const clientXRelative = clientX - containerLeft;
            const clientYRelative = clientY - containerTop;

            const computedStyle = window.getComputedStyle(this.$canvasArea);
            const canvasLeft = parseInt(computedStyle.getPropertyValue('left'));
            const canvasTop = parseInt(computedStyle.getPropertyValue('top'));

            let deltaX: number;
            let deltaY: number;
            if (clientX < canvasRect.x) {
                // maintain x position with left edge of canvas
                deltaX = 0;
            } else if (clientX > canvasRect.x + oldWidth) {
                // maintain x position with right edge of canvas
                deltaX = canvasRect.width - oldWidth;
            } else {
                const distanceFromTopLeftX = clientXRelative - canvasLeft;
                const ratioX = distanceFromTopLeftX / oldWidth;
                deltaX = (ratioX * canvasRect.width) - distanceFromTopLeftX;
            }

            if (clientY < canvasRect.y) {
                // maintain y position with top edge of canvas
                deltaY = 0;
            } else if (clientY > canvasRect.y + oldHeight) {
                // maintain y position with bottom edge of canvas
                deltaY = canvasRect.height - oldHeight;
            } else {
                const distanceFromTopLeftY = clientYRelative - canvasTop;
                const ratioY = distanceFromTopLeftY / oldHeight;
                deltaY = (ratioY * canvasRect.height) - distanceFromTopLeftY;
            }

            this.$canvasArea.style.left = (canvasLeft - deltaX) + 'px';
            this.$canvasArea.style.top = (canvasTop - deltaY) + 'px';
        };

        let lastWheelEvent = 0;
        canvasContainer.addEventListener('wheel', (e) => {
            if (e.deltaY === 0) {
                return;
            }

            // some kinda hacky heuristics to handle scrolling inertia
            if (Date.now() - lastWheelEvent < 75 && Math.abs(e.deltaY) < 40) {
                return;
            }

            lastWheelEvent = Date.now();

            const dir = e.deltaY < 0 ? 1 : -1;

            if (e.shiftKey) {
                const canvas = this.activeCanvas;
                const { width: oldWidth, height: oldHeight } = canvas?.getHTMLRect() || { width: 0, height: 0 };

                let newZoomLevel = Math.max(0.5, Math.min(10, this.settings.zoomLevel + dir));

                if (newZoomLevel > 1) {
                    newZoomLevel = Math.floor(newZoomLevel);
                }

                this.settings.zoomLevel = newZoomLevel;

                this.updateZoomLevelUI();
                this.project?.zoomTo();

                if (canvas) {
                    adjustCanvasPositionRelativeToCursor(canvas, e.clientX, e.clientY, oldWidth, oldHeight);
                }

                return;
            }

            // select prev/next color
            const activeCanvas = this.activeCanvas;
            if (activeCanvas) {
                this.setActiveColor(activeCanvas.getActiveColor() - dir);
            }
        });

        const ignoredInputs: Record<string, 1> = {
            text: 1,
            number: 1,
        };

        document.addEventListener('keydown', (e) => {
            if (panning) {
                return;
            }

            if (Modal.isActive()) {
                return;
            }

            if (
                (e.target instanceof HTMLInputElement && ignoredInputs[e.target.type]) ||
                e.target instanceof HTMLTextAreaElement
            ) {
                return;
            }

            if (e.ctrlKey && e.key.toLowerCase() === 'c') {
                if (this.copyActiveCanvasSelection()) {
                    e.preventDefault();
                }
                return;
            }

            if (e.ctrlKey && e.key.toLowerCase() === 'v') {
                if (this.pasteCopyBuffer()) {
                    e.preventDefault();
                }
                return;
            }

            if (e.shiftKey || e.key === 'Shift') {
                canvasContainer.classList.add('panning-start');
            }

            if (e.ctrlKey && e.key.toLowerCase() === 'z') {
                this.applyCurrentCheckpoint(e.shiftKey);
                return;
            }
            if (e.ctrlKey && e.key.toLowerCase() === 'y') {
                this.applyCurrentCheckpoint(true);
                return;
            }

            if (e.ctrlKey) {
                // let default behavior of browser propagate (e.g. Ctrl+C, Ctrl+W, etc.)
                return;
            }

            if (e.key === 'Escape') {
                this.activeCanvas?.resetDrawContext();
                return;
            }

            if (e.key === 'Delete') {
                this.eraseActiveSelection();
                return;
            }

            if (e.shiftKey && (e.code === 'Numpad0' || e.code === 'Digit0')) {
                const canvas = this.activeCanvas;
                const { width, height } = canvas?.getHTMLRect() || { width: 0, height: 0 };
                this.settings.zoomLevel = 1;
                this.updateZoomLevelUI();
                this.project?.zoomTo();
                if (canvas) {
                    adjustCanvasPositionRelativeToCursor(canvas, currentMouseCoords.x, currentMouseCoords.y, width, height);
                }
                return;
            }

            if (e.key.toLowerCase() === 'w' || e.key.toLowerCase() === 's' || e.code === 'ArrowUp' || e.code === 'ArrowDown') {
                // select prev/next color
                const activeCanvas = this.activeCanvas;
                if (activeCanvas) {
                    const dir = e.key.toLowerCase() === 'w' || e.code === 'ArrowUp' ? -1 : 1;
                    this.setActiveColor(activeCanvas.getActiveColor() + dir);
                }
                return;
            }

            if (e.key.toLowerCase() === 'g') {
                this.settings.showGrid = !this.settings.showGrid;
                this.project?.setShowGrid();
                this.$gridInput.checked = this.settings.showGrid;
                return;
            }

            if (e.key.toLowerCase() === 'c') {
                this.setDrawMode(e.shiftKey ? 'ellipse' : 'ellipse-filled');
                return;
            }
            if (e.key.toLowerCase() === 'd') {
                this.setDrawMode('draw');
                return;
            }
            if (e.key.toLowerCase() === 'e') {
                this.setDrawMode('erase');
                return;
            }
            if (e.key.toLowerCase() === 'f') {
                this.setDrawMode('fill');
                return;
            }
            if (e.key.toLowerCase() === 'r') {
                this.setDrawMode(e.shiftKey ? 'rect' : 'rect-filled');
                return;
            }
            if (e.key.toLowerCase() === 'y') {
                this.setDrawMode('dropper');
                return;
            }
            if (e.key.toLowerCase() === 'l') {
                this.setDrawMode('line');
                return;
            }
            if (e.key.toLowerCase() === 'z') {
                this.setDrawMode('select');
                return;
            }

            if (e.key.toLowerCase() === 't') {
                // cannot toggle transparency when in Kangaroo mode
                if (this.settings.kangarooMode) {
                    return;
                }

                this.settings.uncoloredPixelBehavior = this.settings.uncoloredPixelBehavior === 'color0' ?
                    'background' :
                    'color0';
                this.onUncoloredPixelBehaviorChanged();
                return;
            }

            if (e.key.toLowerCase() === 'k') {
                if (this.activeCanvas?.supportsKangarooMode()) {
                    this.settings.kangarooMode = !this.settings.kangarooMode;
                    this.onKangarooModeChanged();
                }
                return;
            }

            if (e.key.toLowerCase() === 'x') {
                if (e.shiftKey) {
                    this.project?.exportActiveCanvasToImage();
                } else {
                    this.project?.showExportASMModal();
                }
                return;
            }

            if (/^\d$/.test(e.key)) {
                const canvas = this.activeCanvas;
                const { width: oldWidth, height: oldHeight } = canvas?.getHTMLRect() || {
                    width: 0,
                    height: 0
                };

                const value = parseInt(e.key, 10);
                this.settings.zoomLevel = value === 0 ? 10 : value;
                this.updateZoomLevelUI();
                this.project?.zoomTo();

                if (canvas) {
                    adjustCanvasPositionRelativeToCursor(canvas, currentMouseCoords.x, currentMouseCoords.y, oldWidth, oldHeight);
                }
            }
        });

        document.addEventListener('keyup', () => {
            canvasContainer.classList.remove('panning-start');
        });

        canvasContainer.addEventListener('mousedown', (e) => {
            if (!e.shiftKey || !isLeftMouseButton(e)) {
                return;
            }

            e.preventDefault();
            e.stopPropagation();

            canvasContainer.classList.remove('panning-start');
            canvasContainer.classList.add('panning');

            panning = true;
            panningOrigin = { x: e.clientX, y: e.clientY };
        });

        document.addEventListener('mousemove', (e) => {
            currentMouseCoords.x = e.clientX;
            currentMouseCoords.y = e.clientY;

            if (!panning) {
                return;
            }

            e.preventDefault();
            e.stopPropagation();

            canvasContainer.classList.remove('panning-start');

            const { clientX, clientY } = e;

            const deltaX = clientX - panningOrigin.x;
            const deltaY = clientY - panningOrigin.y;

            const computedStyle = window.getComputedStyle(this.$canvasArea);
            const currentX = parseInt(computedStyle.getPropertyValue('left'));
            const currentY = parseInt(computedStyle.getPropertyValue('top'));

            panningOrigin = { x: clientX, y: clientY };

            this.$canvasArea.style.top = (currentY + deltaY) + 'px';
            this.$canvasArea.style.left = (currentX + deltaX) + 'px';
        });

        document.addEventListener('mouseup', () => {
            panning = false;
            canvasContainer.classList.remove('panning-start', 'panning');
        });

        // gutter stuff
        this.$gridInput.addEventListener('change', () => {
            this.settings.showGrid = this.$gridInput.checked;
            this.project?.setShowGrid();
        });

        this.$uncolorPixelInput.addEventListener('change', () => {
            this.settings.uncoloredPixelBehavior = this.$uncolorPixelInput.checked ? 'color0' : 'background';
            this.onUncoloredPixelBehaviorChanged();
        });

        this.$kangarooModeInput.addEventListener('change', () => {
            this.settings.kangarooMode = this.$kangarooModeInput.checked;
            this.onKangarooModeChanged();
        });

        findElement(this.$gutterBottom, '.zoom-level-label').addEventListener('click', () => {
            this.settings.zoomLevel = 1;
            this.updateZoomLevelUI();
            this.project?.zoomTo();
        });

        const inputs: [ HTMLInputElement, (value: number) => void ][] = [
            [ this.$pixelWidthInput, value => this.project?.setPixelDimensions(value, null) ],
            [ this.$pixelHeightInput, value => this.project?.setPixelDimensions(null, value) ],
            [ this.$canvasWidthInput, value => this.project?.setCanvasDimensions(value, null) ],
            [ this.$canvasHeightInput, value => this.project?.setCanvasDimensions(null, value) ],
        ];

        inputs.forEach(([ input, setValue ]) => {
            // prevent non-numeric inputs
            input.addEventListener('keydown', (e) => {
                if (e.key.length === 1 && !/\d/.test(e.key)) {
                    e.preventDefault();
                    return;
                }
            });

            let prevValue = parseInt(input.value) || 1;
            input.addEventListener('change', () => {
                const max = Number(input.max) || 256;
                const min = Number(input.min) || 1;
                const step = Number(input.step) || 1;
                const value = parseInt(input.value);
                if (isNaN(value) || value > max || value < min || value % step !== 0) {
                    input.value = (value > max ? max : (value < min ? min : prevValue)).toString();
                    setValue(Number(input.value));
                    return;
                }

                prevValue = value;
                setValue(value);
            });
        });

        const infoContent = findTemplateContent(document, '#modal-content-help');

        findOrDie(document, '.help-link', node => node instanceof HTMLAnchorElement)
            .addEventListener('click', (e) => {
                e.preventDefault();

                const modal = Modal.create({
                    contentHtml: infoContent.cloneNode(true),
                    actions: 'close',
                    title: 'Info',
                    type: 'default',
                });

                modal.on('action', () => {
                    modal.destroy();
                });
                modal.show();
            });

        const changelogContent = findTemplateContent(document, '#modal-content-changelog');
        findOrDie(document, '.changelog-link', node => node instanceof HTMLAnchorElement)
            .addEventListener('click', (e) => {
                e.preventDefault();

                const modal = Modal.create({
                    contentHtml: changelogContent.cloneNode(true),
                    actions: 'close',
                    title: 'Changelog',
                    type: 'default',
                });

                modal.on('action', () => {
                    modal.destroy();
                });
                modal.show();
            });

        const $displayModeSelect = findSelect(this.$canvasSidebar, '#display-mode-select');
        $displayModeSelect.addEventListener('change', () => {
            const newDisplayMode = $displayModeSelect.value as DisplayModeName;
            switch (newDisplayMode) {
                case 'none':
                case '160A':
                case '160B':
                case '320A':
                case '320B':
                case '320C':
                case '320D':
                    this.project?.setDisplayMode(newDisplayMode);
                    break;
                default:
                    nope(newDisplayMode);
                    throw new Error(`Unknown value in display mode <select>: "${newDisplayMode}"`);
            }
        });

        const $paletteSelect = findSelect(this.$canvasSidebar, '.canvas-palette-select');
        $paletteSelect.addEventListener('change', () => {
            const paletteId = $paletteSelect.value;
            const palette = this.settings.activeColorPaletteSet.getPalettes().find(palette => palette.id === paletteId);
            if (!palette) {
                this.logger.error(`selected palette ${paletteId} not found in active ColorPaletteSet`);
                return;
            }

            this.project?.setColorPalette(palette);
        });

        this.$canvasSidebar.querySelectorAll('button[data-mode]').forEach((el) => {
            if (!(el instanceof HTMLButtonElement)) {
                return;
            }

            const mode = el.getAttribute('data-mode');
            if (!isDrawMode(mode)) {
                el.disabled = true;
                return;
            }

            el.addEventListener('click', () => {
                this.setDrawMode(mode);
            });
        });

        this.selectionButtons.$copy.addEventListener('click', () => this.copyActiveCanvasSelection());
        this.selectionButtons.$crop.addEventListener('click', () => this.cropToActiveSelection());
        this.selectionButtons.$delete.addEventListener('click', () => this.eraseActiveSelection());
        this.selectionButtons.$flipV.addEventListener('click', () => this.flipActiveSelection('vertical'));
        this.selectionButtons.$flipH.addEventListener('click', () => this.flipActiveSelection('horizontal'));
        this.selectionButtons.$paste.addEventListener('click', () => this.pasteCopyBuffer());

        this.updateZoomLevelUI();
        this.initialized = true;
    }

    private applyCurrentCheckpoint(redo = false): void {
        const canvas = this.activeCanvas;
        if (!canvas) {
            return;
        }

        const undoContext = this.undoContext[canvas.id];
        if (!undoContext) {
            return;
        }

        undoContext.current += (redo ? 1 : -1);
        undoContext.current = Math.max(0, Math.min(undoContext.stack.length - 1, undoContext.current));

        const checkpoint = undoContext.stack[undoContext.current];
        if (!checkpoint) {
            this.logger.warn(`no undo checkpoint at index ${undoContext.current}`);
            return;
        }

        this.logger.debug(`applying checkpoint[${undoContext.current}] to canvas ${canvas.id}`);
        this.project?.applyCheckpoint(canvas, checkpoint);
    }

    private emptyCopyBuffer(): void {
        while (this.copyBuffer.length) {
            this.copyBuffer.pop();
        }
    }

    public copyActiveCanvasSelection(): boolean {
        const canvas = this.activeCanvas;
        if (!canvas) {
            return false;
        }

        const pixelData = canvas.getSelectionPixelData();
        if (!pixelData[0]) {
            return false;
        }

        // currently we only allow one item in the copy buffer, but that may change someday
        this.emptyCopyBuffer();

        this.copyBuffer.push({
            canvas,
            displayMode: canvas.getDisplayMode(),
            pixelData,
        });

        const height = pixelData.length;
        const width = pixelData[0].length;

        this.logger.info(`copied ${width}${chars.times}${height} selection from ${canvas.getName()}`);
        Popover.toast({
            type: 'success',
            content: parseTemplate(
                `<div>` +
                    `<i class="fa-solid fa-check"></i>` +
                    `Copied ${width}${chars.times}${height} selection from ${canvas.getName()}` +
                `</div>`
            ),
        });

        this.syncPasteSelectionAction();

        return true;
    }

    public cropToActiveSelection(): void {
        const canvas = this.activeCanvas;
        const rect = canvas?.getCurrentSelection();
        const pixelData = canvas?.getSelectionPixelData();
        if (!canvas || !rect || !pixelData) {
            return;
        }

        this.logger.info(`cropping to ${rect.width}${chars.times}${rect.height}`);
        canvas.clear();

        let width = rect.width;
        const canvasWidthMultiple = canvas.getDisplayMode().pixelsPerByte;
        if (canvasWidthMultiple > 0 && width % canvasWidthMultiple !== 0) {
            width = width + (canvasWidthMultiple - (width % canvasWidthMultiple));
        }

        this.pushUndoItem(canvas);
        this.project?.setCanvasDimensions(width, rect.height);
        canvas.setPixelData(pixelData);
        canvas.setSelection({
            x: 0,
            y: 0,
            ...canvas.getDimensions(),
        });
        this.pushUndoItem(canvas);
    }

    public pasteCopyBuffer(): boolean {
        const copySelection = this.copyBuffer[0];
        if (!copySelection || !copySelection.pixelData[0]) {
            return false;
        }

        const canvas = this.activeCanvas;
        if (!canvas) {
            return false;
        }

        if (canvas.getDisplayMode() !== copySelection.displayMode) {
            Popover.toast({
                type: 'danger',
                content: `Cannot apply selection from ${copySelection.displayMode.name} to ${canvas.getDisplayMode().name}`,
            });
            return false;
        }
        const location: Rect = canvas.getCurrentSelection() || {
            x: 0,
            y: 0,
            ...canvas.getDimensions(),
        };

        const copiedHeight = copySelection.pixelData.length;
        const copiedWidth = copySelection.pixelData[0].length;
        const copiedSize = `${copiedWidth}${chars.times}${copiedHeight}`;

        this.logger.info(`pasting ${copiedSize} selection from ${copySelection.canvas.getName()} ` +
            `at ${location.x},${location.y}`);
        const drawCount = canvas.applyPartialPixelData(copySelection.pixelData, location);

        if (drawCount) {
            Popover.toast({
                type: 'success',
                content: `Successfully applied ${drawCount} pixel${drawCount === 1 ? '' : 's'} originally ` +
                    `from ${copySelection.canvas.getName()}`,
            });
        } else {
            Popover.toast({
                type: 'default',
                content: `Selection from ${copySelection.canvas.getName()} was successfully applied, ` +
                    `but no pixels were drawn`,
            });
        }

        return true;
    }

    public eraseActiveSelection(): void {
        const canvas = this.activeCanvas;
        const rect = canvas?.getCurrentSelection();
        if (!canvas || !rect) {
            return;
        }

        this.logger.info(`erasing selected ${rect.width}${chars.times}${rect.height} pixels`);
        canvas.eraseSelection(rect);
    }

    public flipActiveSelection(dir: 'horizontal' | 'vertical'): void {
        const canvas = this.activeCanvas;
        const rect = canvas?.getCurrentSelection();
        if (!canvas || !rect) {
            return;
        }

        this.logger.info(`flipping selected ${rect.width}${chars.times}${rect.height} pixels ${dir}ly`);
        canvas.flipSelection(rect, dir);
    }

    private syncSelectionActions(canvas: PixelCanvas | null): void {
        this.logger.debug('syncing selection actions');
        const isActiveCanvas = !!canvas && canvas === this.activeCanvas;
        const drawState = canvas?.getDrawState();
        const isSelected = drawState === 'selected';
        const disabled = !canvas || !isActiveCanvas || !isSelected;

        const { $copy, $crop, $delete, $rotate, $flipH, $flipV } = this.selectionButtons;
        $copy.disabled = $crop.disabled = $delete.disabled = $rotate.disabled = $flipV.disabled = disabled;
        $flipH.disabled = disabled || !canvas?.getDisplayMode().supportsHorizontalFlip;
        this.syncPasteSelectionAction();
    }

    private syncPasteSelectionAction(): void {
        this.selectionButtons.$paste.disabled = !this.copyBuffer.length;
    }

    private getDefaultCanvasOptions(): Omit<CanvasOptions, 'group' | 'palette'> {
        return {
            mountEl: this.$canvasArea,
            width: 16,
            height: 16,
            pixelHeight: 8,
            pixelWidth: 8,
            editorSettings: this.settings,
            displayMode: DisplayMode.ModeNone,
        };
    }

    public toJSON(): EditorSerialized {
        return {
            project: this.project?.toJSON() || null,
            paletteSetCollection: this.paletteSets.toJSON(),
            settings: {
                activeColorPaletteSetId: this.settings.activeColorPaletteSet.id,
                showGrid: this.settings.showGrid,
                zoomLevel: this.settings.zoomLevel,
                uncoloredPixelBehavior: this.settings.uncoloredPixelBehavior,
                kangarooMode: this.settings.kangarooMode,
            },
        };
    }

    public save(filename?: string): void {
        const json = this.toJSON();
        const stringified = JSON.stringify(json);
        const blobStream = new Blob([ stringified ]).stream();
        const compressedStream = blobStream.pipeThrough(new CompressionStream('gzip'));

        new Response(compressedStream)
            .blob()
            .then((blob) => {
                const anchor = document.createElement('a');
                anchor.download = filename || `antrax.json.gz`;
                anchor.href = URL.createObjectURL(blob);
                anchor.click();
            })
            .catch((err) => {
                let msg = hasMessage(err) ? ': ' + err.message : '';
                Popover.toast({
                    type: 'danger',
                    title: 'Save failed',
                    content: `Failed to generate downloadable gzip stream of JSON${msg}`,
                });
            });
    }

    public load(data: string | ArrayBuffer | Blob, filename: string): void {
        const handleError = (err: unknown, message: string): void => {
            this.logger.error(err);

            const errMsg = hasMessage(err) ? `: "${err.message}"` : '';
            Popover.toast({
                type: 'danger',
                title: 'Failed to load',
                content: `${filename}: ${message}${errMsg}`,
            });
        };

        let json: object;
        if (typeof data === 'string') {
            try {
                json = JSON.parse(data);
            } catch (err) {
                handleError(err, 'Failed to parse selected file as JSON');
                return;
            }

            try {
                this.loadJson(json);
                Popover.toast({
                    type: 'success',
                    content: `Successfully loaded data from ${filename}`,
                });
            } catch (err) {
                handleError(err, 'JSON successfully parsed, but was not valid');
            }
        } else {
            if (!(data instanceof Blob)) {
                data = new Blob([ data ]);
            }

            this.logger.debug(`attempting to decompress assumed gzip stream`);
            const stream = data.stream();
            const decompressedStream = stream.pipeThrough(new DecompressionStream('gzip'));
            new Response(decompressedStream)
                .blob()
                .then((blob) => {
                    this.logger.debug(`file inflated to ${(blob.size / 1024).toFixed(1)}KB`);
                    return blob.text();
                })
                .then(stringified => this.loadJson(JSON.parse(stringified)))
                .then(() => {
                    Popover.toast({
                        type: 'success',
                        content: `Successfully loaded data from ${filename}`,
                    });
                })
                .catch((err) => {
                    if (err instanceof SyntaxError) {
                        handleError(err, 'File un-gzipped successfully, but failed to be parsed as JSON');
                    } else if (err instanceof DOMException && err.name === 'AbortError') {
                        handleError(err, 'Failed to process gzipped file ' +
                            '(most likely the file is not gzipped or otherwise corrupted)');
                    } else {
                        handleError(err, 'Failed to process gzipped file');
                    }
                });
        }
    }

    private ensureSerialized(json: any): asserts json is EditorSerialized {
        const context: SerializationContext = 'Editor';

        if (!json || typeof json !== 'object') {
            throw new SerializationTypeError(context, '<root>', 'object', json);
        }

        if (!json.project || typeof json.project !== 'object') {
            throw new SerializationTypeError(context, 'project', 'object', json.project);
        }
        if (!json.paletteSetCollection || typeof json.paletteSetCollection !== 'object') {
            throw new SerializationTypeError(context, 'paletteSetCollection', 'object', json.paletteSetCollection);
        }

        const settings = json.settings;

        if (!settings || typeof settings !== 'object') {
            throw new SerializationTypeError(context, 'settings', 'object', json.settings);
        }

        const mappings: [ keyof EditorSettingsSerialized, string ][] = [
            [ 'showGrid', 'boolean' ],
            [ 'zoomLevel', 'number' ],
        ];

        mappings.forEach(([ key, type ]) => {
            if (typeof settings[key] !== type) {
                throw new SerializationTypeError(context, `settings[${key}]`, type, settings[key]);
            }
        });

        const undefinedMappings: [ keyof EditorSettingsSerialized, string ][] = [
            [ 'uncoloredPixelBehavior', 'string' ],
            [ 'kangarooMode', 'boolean' ],
            [ 'drawMode', 'string' ],
        ];

        undefinedMappings.forEach(([ key, type ]) => {
            if (typeof settings[key] !== type && typeof settings[key] !== 'undefined') {
                throw new SerializationTypeError(context, `settings[${key}]`, `${type} or missing`, settings[key]);
            }
        });

        if (typeof settings.activeColorPaletteSetId !== 'number' && typeof settings.activeColorPaletteSetId !== 'string') {
            throw new SerializationTypeError(
                context,
                `settings[activeColorPaletteSetId]`,
                `string or number`,
                settings.activeColorPaletteSetId,
            );
        }
    }

    public loadJson(json: object): void {
        const start = Date.now();

        // TODO remove this once things are more stable
        this.logger.debug(`loading JSON`, json);

        this.ensureSerialized(json);

        const paletteMountEl = findElement(this.$el, '.content-header');

        const paletteSets = json.paletteSetCollection.paletteSets.map(setJson => ColorPaletteSet.fromJSON(setJson, paletteMountEl));
        if (!paletteSets.length) {
            paletteSets.push(new ColorPaletteSet({
                mountEl: paletteMountEl,
            }));
        }

        let activeColorPaletteSet = paletteSets.find(set => set.id === String(json.settings.activeColorPaletteSetId));
        if (!activeColorPaletteSet) {
            this.logger.warn(`ColorPaletteSet{${json.settings.activeColorPaletteSetId}} not found`);
            activeColorPaletteSet = paletteSets[0];
            if (!activeColorPaletteSet) {
                throw new Error(`no ColorPaletteSets, this is a developer error`);
            }
        }

        this.paletteSets.destroy();
        this.project?.destroy();

        const uncoloredPixelBehavior = json.settings.uncoloredPixelBehavior === 'background' ? 'background': 'color0';

        this.settings = {
            zoomLevel: json.settings.zoomLevel,
            showGrid: json.settings.showGrid,
            activeColorPaletteSet,
            uncoloredPixelBehavior,
            kangarooMode: json.settings.kangarooMode || false,
            drawMode: isDrawMode(json.settings.drawMode) ? json.settings.drawMode : 'draw',
        };

        const paletteSetCollection = new ColorPaletteSetCollection({
            editorSettings: this.settings,
            paletteSets,
        });
        this.setPaletteSets(paletteSetCollection);
        this.onPaletteSetChanged();

        const projectJson = json.project;
        if (projectJson) {
            const project = Project.fromJSON(
                projectJson,
                this.$el,
                this.$canvasArea,
                this.settings,
                this.paletteSets.getPaletteSets(),
            );

            this.setProject(project);
        }

        this.undoContext = {};
        this.emptyCopyBuffer();
        this.paletteSets.init();
        this.project?.init();
        this.updateZoomLevelUI();
        this.updateGridUI();
        this.updateUncolorPixelBehaviorUI();
        this.updateKangarooModeUI();
        this.setDrawMode(this.settings.drawMode, true);
        this.syncSelectionActions(null);

        this.logger.info(`load successful in ${Date.now() - start}ms`);
    }
}
