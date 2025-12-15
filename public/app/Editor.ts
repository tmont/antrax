import { ColorPaletteSet } from './ColorPaletteSet.ts';
import { ColorPaletteSetCollection, type ColorPaletteSetCollectionSerialized } from './ColorPaletteSetCollection.ts';
import DisplayMode from './DisplayMode.ts';
import { type SerializationContext, SerializationTypeError } from './errors.ts';
import { Logger } from './Logger.ts';
import { Modal } from './Modal.ts';
import { ObjectGroup } from './ObjectGroup.ts';
import { type CanvasOptions, PixelCanvas, type PixelDrawingBehavior } from './canvas/PixelCanvas.ts';
import { Popover } from './Popover.ts';
import { Project, type ProjectSerialized } from './Project.ts';
import {
    getZoomIndex,
    isValidZoomLevel,
    isValidZoomLevelIndex,
    zoomLevelIndexDefault,
    zoomLevelIndexMax,
    zoomLevelLabel,
    zoomLevels
} from './utils-zoom.ts';
import {
    chars,
    clamp,
    type ColorPaletteSetStats,
    type Coordinate,
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
    type LoadedFile,
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
    uncoloredPixelBehavior: 'color0' | 'background';
    kangarooMode: boolean;
    drawMode: DrawMode;
}

export interface EditorSettingsSerialized extends Pick<EditorSettings, 'showGrid' | 'zoomLevel'> {
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

const zoomFormTmpl = `
<form class="form-vertical">
    <input class="form-control zoom-level-input"
           autocomplete="off"
           type="range"
           min="0"
           max="${zoomLevelIndexMax}"
           step="1" />
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
    private readonly $canvasLocation: HTMLElement;
    private readonly $activeGroupName: HTMLElement;
    private readonly $activeObjectName: HTMLElement;
    private readonly $canvasArea: HTMLElement;
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
        this.$canvasLocation = findElement(this.$gutterTop, '.canvas-location');
        this.$activeGroupName = findElement(this.$gutterTop, '.breadcrumb .active-group-name');
        this.$activeObjectName = findElement(this.$gutterTop, '.breadcrumb .active-object-name');
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

        this.settings = options.settings || {
            showGrid: false,
            zoomLevel: 3,
            uncoloredPixelBehavior: 'color0',
            kangarooMode: false,
            drawMode: 'draw',
        };

        this.paletteSets = new ColorPaletteSetCollection({
            paletteSets: options.paletteSets,
            activePaletteSet: null, // will be set once a canvas is activated
        });

        this.setPaletteSets(this.paletteSets);
    }

    private get activeCanvas(): PixelCanvas | null {
        return this.project?.getActiveCanvas() || null;
    }

    public createProject(name: Project['name']): Project {
        return new Project({
            name,
            editorSettings: this.settings,
            mountEl: findElement(this.$el, '.project-container'),
        });
    }

    public setProject(project: Project): void {
        // disable events on previously active project
        this.project?.off();

        let undoTimeoutId: number | null = null;

        this.project = project;
        this.project.off();
        this.project.on('canvas_activate', (activeCanvas) => {
            this.logger.debug(`canvas ${activeCanvas?.getName() || '[none]'} activated`);
            this.setGroupName(activeCanvas?.getGroup());
            this.setObjectName(activeCanvas);

            // draw modes:
            // the only weird one is "move", where it makes no sense to be in "move" mode
            // if nothing is selected. so if you activate a canvas that has nothing selected,
            // and you're in "move" mode, instead switch to "select" mode.
            // if you switch to a canvas that was previously moving something, forcefully switch back
            // to "move" mode.

            if (this.settings.drawMode === 'move' && !activeCanvas?.getCurrentSelection()) {
                this.setDrawMode('select');
            } else if (activeCanvas?.isMoving()) {
                this.setDrawMode('move');
            }

            this.onPaletteSetChanged();
            this.syncDrawModeButtons();

            this.$canvasCoordinates.innerText = `0, 0`;

            if (activeCanvas) {
                this.syncCanvasLocation();
                this.onPixelDimensionsChanged(activeCanvas);
                this.onCanvasDimensionsChanged(activeCanvas);
                this.onDisplayModeChanged(activeCanvas);
                this.onCanvasPaletteChanged(activeCanvas);

                // among other things, this helps cloned items have an initial undo state that
                // is not blank
                this.pushUndoItem(activeCanvas);
            } else {
                // onDisplayModeChanged also calls syncSelectionActions so we don't need this
                // on the other side of the conditional here.
                this.syncSelectionActions(null);

                this.syncCanvasLocation({ x: 0, y: 0 });
            }

            this.syncDisplayModeControl();

            const $displayModeSelect = findSelect(this.$canvasSidebar, '#display-mode-select');
            $displayModeSelect.value = activeCanvas?.displayMode.name || 'none';

            findElement(this.$canvasSidebar, '.no-selected-object').classList.toggle('hidden', !!activeCanvas);
            findElement(this.$canvasSidebar, '.has-selected-object').classList.toggle('hidden', !activeCanvas);
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
        this.project.on('pixel_hover', (coordinate) => {
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
        this.project.on('canvas_palette_set_change', () => {
            this.onPaletteSetChanged();
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
        this.project.on('item_add', () => {
            this.updateObjectStats();
        });
        this.project.on('item_remove', () => {
            this.updateObjectStats();
        });
        this.project.on('action_add_object', () => {
            this.project?.createObjectInNewGroup(this.getDefaultCanvasOptions());
        });
        this.project.on('action_save', ($target) => {
            const $form = parseTemplate(saveAsFormTmpl);
            if (!($form instanceof HTMLFormElement)) {
                throw new Error(`saveAsFormTmpl is misconfigured, no <form> element`);
            }

            const popover = new Popover({
                content: $form,
            });

            popover.show($target);

            const $filenameInput = findInput($form, 'input.filename-input');

            // const entropy = new Date().toISOString()
            //     .replace(/T/, '_')
            //     .replace(/\..*$/, '')
            //     .replace(/\W/g, '')

            const name = (this.project?.getName().trim() || 'antrax')
                .toLowerCase()
                .replace(/ /g, '_')
                .replace(/\W/g, '');
            const prefix = name || 'antrax';
            $filenameInput.value = `${prefix}.json.gz`;

            $filenameInput.focus();
            $filenameInput.setSelectionRange(0, prefix.length);
            $form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.save($filenameInput.value.trim());
                popover.hide();
            });
        });
        this.project.on('action_load', async (file) => {
            // normally it should be application/gzip, but sometimes it's application/x-gzip, so now
            // we just look for "gzip" anywhere and assume it's gzipped

            const loadedFile: LoadedFile = {
                name: file.name,
                size: file.size,
                sizeInflated: null,
                loadTime: new Date(),
            };
            if (!/gzip/.test(file.type)) {
                // assume it's JSON
                this.load(await file.text(), loadedFile);
            } else {
                this.load(await file.arrayBuffer(), loadedFile);
            }
        });

        this.updateObjectStats();
    }

    private updateObjectStats(): void {
        const map = new Map<ColorPaletteSet, ColorPaletteSetStats>();
        this.paletteSets.getPaletteSets().forEach((paletteSet) => {
            map.set(paletteSet, {
                objectCount: this.project?.getObjectCountForPaletteSet(paletteSet) || 0,
            });
        });

        this.paletteSets.updateStats({
            paletteSetStats: map,
        });
    }

    private syncSelectionSize(): void {
        const canvas = this.project?.getActiveCanvas();
        const { width, height } = canvas?.getCurrentSelection() || { width: 0, height: 0 };
        this.$selectionSize.innerText = `${width}${chars.times}${height}`;
    }

    private syncCanvasLocation(coordinate?: Coordinate): void {
        if (!coordinate) {
            const style = window.getComputedStyle(this.$canvasArea);
            const left = parseInt(style.getPropertyValue('left'), 10) || 0;
            const top = parseInt(style.getPropertyValue('top'), 10) || 0;
            coordinate = {
                x: left,
                y: top,
            };
        }

        // when zooming we re-position the canvas using fancy math so we get sub=pixels. don't
        // need to show that nonsense in the UI, though.
        this.$canvasLocation.innerText = `${Math.round(coordinate.x)}, ${Math.round(coordinate.y)}`;
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
        const canvasHasData = typeof hasData === 'undefined' ? canvas?.hasData() || false : hasData;

        Array.from(this.$displayModeSelect.options).forEach((option) => {
            if (!DisplayMode.isValidName(option.value)) {
                option.disabled = true;
                return;
            }

            if (!canvasHasData) {
                option.disabled = false;
                return;
            }

            option.disabled = !canvas ||
                DisplayMode.create(option.value).numColors !== canvas.displayMode.numColors;
        });
    }

    private onPaletteSetChanged(): void {
        const set = this.activeCanvas?.paletteSet || null;
        const $select = findSelect(this.$canvasSidebar, '.canvas-palette-select');
        while ($select.options.length) {
            $select.remove(0);
        }

        set?.getPalettes().forEach((palette) => {
            const $option = document.createElement('option');
            $option.value = palette.id.toString();
            $option.innerText = palette.name;
            $select.add($option, null);
        });

        this.logger.debug(`updated palette <select> with palettes from ColorPaletteSet{${set?.id || '[none]'}}`);

        this.syncActivePaletteAndColors();

        this.paletteSets.activatePaletteSet(set);
    }

    private onDisplayModeChanged(canvas: PixelCanvas): void {
        const displayMode = canvas.displayMode;
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

        this.$kangarooModeInput.disabled = !canvas.supportsKangarooMode();

        // forcefully toggle out of Kangaroo mode if the display does not support it
        if (this.settings.kangarooMode && !canvas.supportsKangarooMode()) {
            this.logger.debug(`setting kangarooMode=false because not supported for displayMode=${displayMode.name}`);
            this.settings.kangarooMode = false;
            this.onKangarooModeChanged();
        }

        this.syncActivePaletteAndColors();
        this.syncCanvasSidebarColors();
        this.syncSelectionActions(canvas); // some actions are disabled based on the display mode (e.g. horizontal flip)

        // background must be re-rendered because certain display modes have a different color0 (e.g. 320D
        // in Kangaroo mode). and the whole canvas needs to be re-rendered because you can switch between certain
        // display modes even if they have data.
        canvas.render();
    }

    private syncActivePaletteAndColors(): void {
        const canvas = this.activeCanvas;
        if (!canvas) {
            return;
        }

        const displayMode = canvas.displayMode;
        const paletteSet = canvas.paletteSet;
        paletteSet.setActivePalette(displayMode.hasSinglePalette ? canvas.palette : null);
        paletteSet.setActiveColor(canvas.getColors()[canvas.getActiveColor()]);
    }

    private syncCanvasSidebarColors(): void {
        const canvas = this.activeCanvas;
        if (!canvas) {
            this.logger.info(`syncCanvasSidebarColors: no canvas, doing nothing`);
            return;
        }

        const displayMode = canvas.displayMode;
        this.logger.debug(`syncing canvas sidebar colors (displayMode=${displayMode.name})`);

        const palette = canvas.palette;
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
                           canvas.paletteSet.getBackgroundColor().hex :
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
        if (canvas !== this.activeCanvas) {
            return;
        }

        const palette = canvas.palette;
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
        this.syncActivePaletteAndColors();

        const activePaletteSet = canvas.paletteSet;
        activePaletteSet.setActivePalette(canvas.displayMode.hasSinglePalette ? palette : null);
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

        this.settings.drawMode = newMode;

        Array.from(this.$canvasArea.classList).forEach((cls) => {
            if (/^draw-mode-/.test(cls)) {
                this.$canvasArea.classList.remove(cls);
            }
        });
        this.$canvasArea.classList.add(`draw-mode-${newMode}`);

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

        const canvas = this.activeCanvas;
        if (!canvas) {
            return;
        }

        if (this.settings.drawMode !== 'move') {
            // in "move" mode the selection stays up, so we keep the current context
            canvas.resetDrawContext();
        }

        // some draw modes do some hidden destructive actions (particularly "move" mode), so just
        // preemptively create an undo checkpoint so that the user can get back to where they
        // started easily.
        this.pushUndoItem(canvas);
    }

    public syncDrawModeButtons(): void {
        const canvas = this.activeCanvas;
        const $buttons = this.$canvasSidebar.querySelectorAll<HTMLButtonElement>('button[data-mode]');
        if (!canvas) {
            $buttons.forEach($button => $button.disabled = true);
            return;
        }

        const somethingIsSelected = !!canvas.getCurrentSelection();
        const moveMode: DrawMode = 'move';
        $buttons.forEach(($button) => {
            $button.disabled = $button.getAttribute('data-mode') === moveMode && !somethingIsSelected;
        });
    }

    public setPaletteSets(paletteSets: ColorPaletteSetCollection): void {
        this.paletteSets.off();

        this.paletteSets = paletteSets;
        this.paletteSets.on('color_change', (paletteSet, palette) => {
            this.project?.updatePaletteColor(paletteSet, palette);
            this.syncCanvasSidebarColors();
            this.project?.updateActiveObjectInfo();
        });
        this.paletteSets.on('bg_select', (paletteSet) => {
            this.project?.setBackgroundColor(paletteSet);
            this.syncCanvasSidebarColors();
        });
        this.paletteSets.on('palette_set_select', (paletteSet) => {
            if (!this.activeCanvas) {
                return;
            }

            this.logger.info(`setting active palette set to ${paletteSet.getName()} (${paletteSet.id})`);
            this.activeCanvas.setColorPaletteSet(paletteSet);
            this.updateObjectStats();
        });
        this.paletteSets.on('name_change', (paletteSet) => {
            this.project?.updatePaletteSetUI(paletteSet);
        });
    }

    private setActiveColor(colorValue: DisplayModeColorIndex): void {
        const canvas = this.activeCanvas;
        if (!canvas) {
            return;
        }

        const colorCount = canvas.getColors().length;
        colorValue = ((colorValue % colorCount) + colorCount) % colorCount;

        this.logger.info(`setting active color to ${colorValue}/${colorCount}`);
        this.project?.setActiveColor(colorValue);
        this.syncActivePaletteAndColors();

        const $colorList = findElement(this.$canvasSidebar, '.color-list');
        $colorList.querySelectorAll('[data-color-value]').forEach(($swatch) => {
            $swatch.classList.toggle('active',
                $swatch.getAttribute('data-color-value') === colorValue.toString());
        });
    }

    public updateZoomLevelUI(): void {
        this.$zoomValue.innerText = (
            isValidZoomLevel(this.settings.zoomLevel) ?
                zoomLevelLabel[this.settings.zoomLevel] :
                this.settings.zoomLevel
        ) + 'x';

        // if the popover to set the zoom level is open, keep that in sync as well
        const $zoomInput = document.body.querySelector('input.zoom-level-input');
        if ($zoomInput instanceof HTMLInputElement) {
            const zoomIndex = isValidZoomLevel(this.settings.zoomLevel) ?
                getZoomIndex(this.settings.zoomLevel) :
                zoomLevelIndexDefault;
            $zoomInput.value = zoomIndex.toString();
        }
    }

    public updateGridUI(): void {
        this.$gridInput.checked = this.settings.showGrid;
    }

    public updateKangarooModeUI(): void {
        this.$kangarooModeInput.checked = this.settings.kangarooMode;
        this.$uncolorPixelInput.disabled = this.settings.kangarooMode;
        this.syncCanvasSidebarColors();
        this.syncActivePaletteAndColors();
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

    private deselectAll(): void {
        this.activeCanvas?.resetDrawContext();
        if (this.settings.drawMode === 'move') {
            this.setDrawMode('select');
        }
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

        findElement(this.$canvasSidebar, '.new-object-btn').addEventListener('click', () => {
            if (!this.project) {
                return;
            }

            this.project.createObjectInNewGroup(this.getDefaultCanvasOptions());
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

            const coordinate: Coordinate = {
                x: canvasLeft - deltaX,
                y: canvasTop - deltaY,
            };
            this.$canvasArea.style.left = coordinate.x + 'px';
            this.$canvasArea.style.top = coordinate.y + 'px';
            this.syncCanvasLocation(coordinate);
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

                const currentZoomIndex = isValidZoomLevel(this.settings.zoomLevel) ?
                    getZoomIndex(this.settings.zoomLevel) :
                    zoomLevelIndexDefault;

                this.setAndClampZoomIndex(currentZoomIndex + dir);

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

            // we want ESC to hide popovers even if an input is focused
            if (e.key === 'Escape') {
                // popovers take precedence over modals, because some modals open popovers
                if (Popover.hideTopMost()) {
                    return;
                }

                if (Modal.current) {
                    Modal.current.hide();
                    return;
                }
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

            if (e.ctrlKey && e.key.toLowerCase() === 'a') {
                if (!this.activeCanvas) {
                    return;
                }

                e.preventDefault();

                if (e.shiftKey) {
                    this.logger.debug(`deselecting due to Ctrl+Shift+A`);
                    this.deselectAll();
                    return;
                }

                this.logger.debug(`selecting entire active canvas`);
                this.setDrawMode('select');
                this.activeCanvas.setSelection({
                    x: 0,
                    y: 0,
                    ...this.activeCanvas.getDimensions(),
                });
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
                this.logger.debug(`deselecting due to ESC`);
                this.deselectAll();
                return;
            }

            if (e.key === 'Delete') {
                this.eraseActiveSelection();
                return;
            }

            if (e.shiftKey && (e.code === 'Numpad0' || e.code === 'Digit0')) {
                const canvas = this.activeCanvas;
                const { width, height } = canvas?.getHTMLRect() || { width: 0, height: 0 };

                this.setAndClampZoomIndex(getZoomIndex(1));
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
            if (e.key.toLowerCase() === 'm') {
                if (this.activeCanvas?.getCurrentSelection()) {
                    this.setDrawMode('move');
                }
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
                    this.project?.showExportImagesModal();
                } else {
                    this.project?.showExportASMModal();
                }
                return;
            }

            if (e.key === '-' || e.key === '=' || e.key === '_' || e.key === '+') {
                const dir = e.key === '-' || e.key === '_' ? -1 : 1;
                const canvas = this.activeCanvas;
                const { width: oldWidth, height: oldHeight } = canvas?.getHTMLRect() || {
                    width: 0,
                    height: 0
                };

                const currentZoomIndex = isValidZoomLevel(this.settings.zoomLevel) ?
                    getZoomIndex(this.settings.zoomLevel) :
                    zoomLevelIndexDefault;
                this.setAndClampZoomIndex(currentZoomIndex + dir);

                if (canvas) {
                    adjustCanvasPositionRelativeToCursor(canvas, currentMouseCoords.x, currentMouseCoords.y, oldWidth, oldHeight);
                }
            }
        });

        document.addEventListener('keyup', () => {
            canvasContainer.classList.remove('panning-start');
        });

        // handle the popover hiding stack
        document.addEventListener('mousedown', (e) => {
            if (!(e.target instanceof Node)) {
                return;
            }

            if (!Popover.topMostContains(e.target)) {
                Popover.hideTopMost();
            }
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

            const coordinate: Coordinate = {
                x: currentX + deltaX,
                y: currentY + deltaY,
            };
            this.$canvasArea.style.top = coordinate.y + 'px';
            this.$canvasArea.style.left = coordinate.x + 'px';
            this.syncCanvasLocation(coordinate);
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

        const $zoomFormContent = parseTemplate(zoomFormTmpl);

        const zoomPopover = new Popover({
            title: 'Set zoom level',
            content: $zoomFormContent,
        });
        const $zoomLabel = findElement(this.$gutterBottom, '.zoom-level-label');
        const $zoomInput = findInput($zoomFormContent, 'input');
        $zoomFormContent.addEventListener('submit', e => e.preventDefault());

        $zoomInput.addEventListener('input', () => this.setAndClampZoomIndex(Number($zoomInput.value)));
        $zoomLabel.addEventListener('click', () => {
            const zoomIndex = isValidZoomLevel(this.settings.zoomLevel) ?
                getZoomIndex(this.settings.zoomLevel) :
                zoomLevelIndexDefault;
            $zoomInput.value = zoomIndex.toString();

            zoomPopover.show($zoomLabel);
            $zoomInput.focus();
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
            const palette = this.activeCanvas?.paletteSet.findPaletteById(paletteId);
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

        // top gutter stuff
        this.selectionButtons.$copy.addEventListener('click', () => this.copyActiveCanvasSelection());
        this.selectionButtons.$crop.addEventListener('click', () => this.cropToActiveSelection());
        this.selectionButtons.$delete.addEventListener('click', () => this.eraseActiveSelection());
        this.selectionButtons.$flipV.addEventListener('click', () => this.flipActiveSelection('vertical'));
        this.selectionButtons.$flipH.addEventListener('click', () => this.flipActiveSelection('horizontal'));
        this.selectionButtons.$paste.addEventListener('click', () => this.pasteCopyBuffer());

        this.$canvasLocation.addEventListener('click', () => {
            const coordinate: Coordinate = {
                x: 64,
                y: 64,
            };
            this.$canvasArea.style.left = `${coordinate.x}px`;
            this.$canvasArea.style.top = `${coordinate.y}px`;
            this.syncCanvasLocation(coordinate);
        });

        this.updateZoomLevelUI();
        this.initialized = true;
    }

    private setAndClampZoomIndex(newIndex: number): void {
        const realZoomIndex = clamp(0, zoomLevelIndexMax, newIndex);
        const newZoomLevel = isValidZoomLevelIndex(realZoomIndex) ?
            zoomLevels[realZoomIndex] :
            zoomLevels[zoomLevelIndexDefault];

        if (this.settings.zoomLevel === newZoomLevel) {
            return;
        }

        this.settings.zoomLevel = newZoomLevel;
        this.updateZoomLevelUI();
        this.project?.zoomTo();
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
        undoContext.current = clamp(0, undoContext.stack.length - 1, undoContext.current);

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
            displayMode: canvas.displayMode,
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
        const canvasWidthMultiple = canvas.displayMode.pixelsPerByte;
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

        if (canvas.displayMode !== copySelection.displayMode) {
            Popover.toast({
                type: 'danger',
                content: `Cannot apply selection from ${copySelection.displayMode.name} to ` +
                    `${canvas.displayMode.name} because they have incompatible display modes`,
            });
            return false;
        }
        const location: Rect = {
            x: 0,
            y: 0,
            ...canvas.getDimensions(),
        };

        const copiedHeight = copySelection.pixelData.length;
        const copiedWidth = copySelection.pixelData[0].length;
        const copiedSize = `${copiedWidth}${chars.times}${copiedHeight}`;

        this.logger.info(`pasting ${copiedSize} selection from ${copySelection.canvas.getName()} ` +
            `at ${location.x},${location.y}`);

        const pixelData = copySelection.pixelData;

        // paste onto [0, 0], select the newly pasted data, and go into move mode. note that
        // we are manually setting other options so that it doesn't commit it to the canvas by default
        // and also doesn't erase the selection once you start moving (which is the default behavior).
        const selectionRect: Rect = {
            ...location,
            width: Math.min(copiedWidth, location.width),
            height: Math.min(copiedHeight, location.height),
        };
        canvas.setSelection(selectionRect, pixelData, false);
        this.setDrawMode('move');

        Popover.toast({
            type: 'success',
            content: `Successfully copied data from ${copySelection.canvas.getName()} onto ${canvas.getName()}`,
        });

        return true;
    }

    public eraseActiveSelection(): void {
        const canvas = this.activeCanvas;
        const rect = canvas?.getCurrentSelection();
        if (!canvas || !rect) {
            return;
        }

        this.logger.info(`erasing selected ${rect.width}${chars.times}${rect.height} pixels`);
        canvas.eraseCurrentSelection();
    }

    public flipActiveSelection(dir: 'horizontal' | 'vertical'): void {
        const canvas = this.activeCanvas;
        const rect = canvas?.getCurrentSelection();
        if (!canvas || !rect) {
            return;
        }

        this.logger.info(`flipping selected ${rect.width}${chars.times}${rect.height} pixels ${dir}ly`);
        canvas.flipCurrentSelection(dir);
    }

    private syncSelectionActions(canvas: PixelCanvas | null): void {
        this.logger.debug('syncing selection actions');
        const isActiveCanvas = !!canvas && canvas === this.activeCanvas;
        const drawState = canvas?.getDrawState();
        const isSelected = drawState === 'selected';
        const disabled = !canvas || !isActiveCanvas || !isSelected;

        const { $copy, $crop, $delete, $rotate, $flipH, $flipV } = this.selectionButtons;
        $copy.disabled = $crop.disabled = $delete.disabled = $flipV.disabled = disabled;
        $rotate.disabled = true; // rotate not supported yet
        $flipH.disabled = disabled || !canvas?.displayMode.supportsHorizontalFlip;
        this.syncPasteSelectionAction();
        this.syncDrawModeButtons();
    }

    private syncPasteSelectionAction(): void {
        this.selectionButtons.$paste.disabled = !this.copyBuffer.length;
    }

    private getDefaultCanvasOptions(): Omit<CanvasOptions, 'group' | 'palette'> {
        const paletteSet = this.activeCanvas?.paletteSet || this.paletteSets.getPaletteSets()[0];
        if (!paletteSet) {
            throw new Error(`Cannot generate canvas options because there are no palette sets`);
        }

        return {
            mountEl: this.$canvasArea,
            width: 16,
            height: 16,
            pixelHeight: 8,
            pixelWidth: 8,
            editorSettings: this.settings,
            displayMode: DisplayMode.ModeNone,
            paletteSet,
        };
    }

    public toJSON(): EditorSerialized {
        return {
            project: this.project?.toJSON() || null,
            paletteSetCollection: this.paletteSets.toJSON(),
            settings: {
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

    public load(data: string | ArrayBuffer | Blob, file: LoadedFile): void {
        const filename = file.name;

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
                    file.sizeInflated = blob.size;
                    this.logger.debug(`file inflated to ${(blob.size / 1024).toFixed(1)}KB`);
                    return blob.text();
                })
                .then(stringified => this.loadJson(JSON.parse(stringified)))
                .then(() => {
                    this.project?.setLoadedFile(file);
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
    }

    public loadJson(json: object): void {
        const start = Date.now();

        this.ensureSerialized(json);

        const paletteMountEl = findElement(this.$el, '.content-header');

        const paletteSets = json.paletteSetCollection.paletteSets.map(setJson => ColorPaletteSet.fromJSON(setJson, paletteMountEl));
        if (!paletteSets.length) {
            paletteSets.push(new ColorPaletteSet({
                mountEl: paletteMountEl,
            }));
        }

        this.paletteSets.destroy();
        this.project?.destroy();

        const uncoloredPixelBehavior = json.settings.uncoloredPixelBehavior === 'background' ? 'background': 'color0';

        this.settings = {
            zoomLevel: json.settings.zoomLevel,
            showGrid: json.settings.showGrid,
            uncoloredPixelBehavior,
            kangarooMode: json.settings.kangarooMode || false,
            drawMode: isDrawMode(json.settings.drawMode) ? json.settings.drawMode : 'draw',
        };

        const paletteSetCollection = new ColorPaletteSetCollection({
            paletteSets,
            activePaletteSet: null, // will be set once a canvas is activated
        });
        this.setPaletteSets(paletteSetCollection);
        this.onPaletteSetChanged();

        const projectJson = json.project;
        if (projectJson) {
            const project = Project.fromJSON(
                projectJson,
                findElement(this.$el, '.project-container'),
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
