import { ColorPaletteSet } from './ColorPaletteSet.ts';
import { ColorPaletteSetCollection, type ColorPaletteSetCollectionSerialized } from './ColorPaletteSetCollection.ts';
import DisplayMode from './DisplayMode.ts';
import { Logger } from './Logger.ts';
import { Modal } from './Modal.ts';
import { ObjectGroup } from './ObjectGroup.ts';
import { PixelCanvas } from './PixelCanvas.ts';
import { Project, type ProjectSerialized } from './Project.ts';
import {
    type DisplayModeColorIndex,
    type DisplayModeColorValue,
    type DisplayModeName,
    findElement,
    findInput,
    findOrDie,
    findSelect,
    findTemplateContent,
    getColorValueCombinedLabel,
    isLeftMouseButton,
    nope,
    parseTemplate
} from './utils.ts';

export interface EditorSettings {
    showGrid: boolean;
    zoomLevel: number;
    activeColorPaletteSet: ColorPaletteSet;
    uncoloredPixelBehavior: 'transparent' | 'background';
    kangarooMode: boolean;
}

export interface EditorSettingsSerialized extends Pick<EditorSettings, 'showGrid' | 'zoomLevel'> {
    activeColorPaletteSetId: ColorPaletteSet['id'];
    uncoloredPixelBehavior?: EditorSettings['uncoloredPixelBehavior'];
    kangarooMode?: EditorSettings['kangarooMode'];
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

export interface UndoCheckpoint {
    pixelData: PixelCanvas['pixelData'];
}

export interface UndoContext {
    stack: UndoCheckpoint[];
    current: number;
}

export class Editor {
    private project: Project | null = null;
    private readonly logger: Logger;
    private readonly $el: HTMLElement;
    private readonly $gutter: HTMLElement;
    private readonly $gridInput: HTMLInputElement;
    private readonly $transparentInput: HTMLInputElement;
    private readonly $zoomValue: HTMLElement;
    private readonly $pixelWidthInput: HTMLInputElement;
    private readonly $pixelHeightInput: HTMLInputElement;
    private readonly $canvasWidthInput: HTMLInputElement;
    private readonly $canvasHeightInput: HTMLInputElement;
    private readonly $canvasCoordinates: HTMLElement;
    private readonly $activeGroupName: HTMLElement;
    private readonly $activeObjectName: HTMLElement;
    private readonly $canvasArea: HTMLElement;
    private readonly $projectControls: HTMLElement;
    private readonly $canvasSidebar: HTMLElement;
    private readonly $displayModeSelect: HTMLSelectElement;
    private readonly $kangarooModeInput: HTMLInputElement;
    private initialized = false;
    private settings: EditorSettings;

    private paletteSets: ColorPaletteSetCollection;
    private undoContext: Record<PixelCanvas['id'], UndoContext> = {};

    public get name(): string {
        return 'Editor';
    }

    public constructor(options: EditorOptions) {
        this.$el = options.mountEl;

        this.logger = Logger.from(this);

        this.$gutter = findElement(this.$el, '.canvas-gutter');
        this.$canvasArea = findElement(this.$el, '.canvas-area');
        this.$gridInput = findInput(this.$gutter, '#option-show-grid');
        this.$transparentInput = findInput(this.$gutter, '#option-show-transparent');
        this.$kangarooModeInput = findInput(this.$gutter, '#option-kangaroo-mode');
        this.$zoomValue = findElement(this.$gutter, '.zoom-level-value');
        this.$pixelWidthInput = findInput(this.$gutter, '#option-pixel-width');
        this.$pixelHeightInput = findInput(this.$gutter, '#option-pixel-height');
        this.$canvasWidthInput = findInput(this.$gutter, '#option-canvas-width');
        this.$canvasHeightInput = findInput(this.$gutter, '#option-canvas-height');
        this.$canvasCoordinates = findElement(this.$gutter, '.current-coordinates');
        this.$activeGroupName = findElement(this.$gutter, '.breadcrumb .active-group-name');
        this.$activeObjectName = findElement(this.$gutter, '.breadcrumb .active-object-name');
        this.$projectControls = findElement(this.$el, '.project-controls');
        this.$canvasSidebar = findElement(this.$el, '.canvas-sidebar');
        this.$displayModeSelect = findSelect(this.$canvasSidebar, '#display-mode-select');

        const defaultPaletteSet = options.paletteSets[0];
        if (!defaultPaletteSet) {
            throw new Error(`paletteSets cannot be empty`);
        }

        this.settings = options.settings || {
            showGrid: false,
            zoomLevel: 2,
            activeColorPaletteSet: defaultPaletteSet,
            uncoloredPixelBehavior: 'transparent',
            kangarooMode: false,
        };

        this.paletteSets = new ColorPaletteSetCollection({
            paletteSets: options.paletteSets,
            editorSettings: this.settings,
        });

        this.setPaletteSets(this.paletteSets);
        this.onPaletteSetChanged();
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

        const pushUndoItem = (canvas: PixelCanvas) => {
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
            const currentHash = PixelCanvas.generateHash(pixelData);
            const topHash = topOfStack ? PixelCanvas.generateHash(topOfStack.pixelData) : null;

            if (topOfStack && currentHash === topHash) {
                // top of stack has the same state, don't want consecutive undo items to be identical
                this.logger.info(`undo stack has identical data, not pushing`);
                return;
            }

            undoContext.stack.push({ pixelData });

            while (undoContext.stack.length > 1000) {
                undoContext.stack.shift();
            }

            undoContext.current = undoContext.stack.length - 1;
            this.logger.debug(`pushing onto undo stack ${undoContext.current}/${undoContext.stack.length - 1}`);
        };

        this.project = project;
        this.project.off();
        this.project.on('canvas_activate', (activeCanvas) => {
            this.$activeGroupName.innerText = activeCanvas?.group.getName() || 'n/a';
            this.$activeObjectName.innerText = activeCanvas?.getName() || 'n/a';

            this.$canvasCoordinates.innerText = `0,0`;

            findElement(this.$canvasSidebar, '.group-name').innerText = activeCanvas?.group.getName() || '';
            findElement(this.$canvasSidebar, '.palette-set-name').innerText = activeCanvas?.group.getPaletteSet().getName() || '';
            findElement(this.$canvasSidebar, '.object-name').innerText = activeCanvas?.getName() || '';

            if (activeCanvas) {
                this.onPixelDimensionsChanged(activeCanvas);
                this.onCanvasDimensionsChanged(activeCanvas);
                this.onDisplayModeChanged(activeCanvas);
                this.onCanvasPaletteChanged(activeCanvas);
            }

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
        this.project.on('pixel_highlight', (e) => {
            this.$canvasCoordinates.innerText = `${e.row},${e.col}`;
        });
        this.project.on('pixel_draw', (e, canvas) => {
            if (e.behavior === 'user') {
                this.$canvasCoordinates.innerText = `${e.row},${e.col}`;
                if (undoTimeoutId) {
                    window.clearTimeout(undoTimeoutId);
                    undoTimeoutId = null;
                }

                undoTimeoutId = window.setTimeout(() => pushUndoItem(canvas), 250);
            }

            this.syncDisplayModeControl();
        });
        this.project.on('canvas_reset', () => {
            this.syncDisplayModeControl(false);
        });
        this.project.on('canvas_render', () => {
            this.syncDisplayModeControl();
        });
        this.project.on('draw_start', (canvas) => {
            pushUndoItem(canvas);
        });
        this.project.on('active_object_name_change', (activeCanvas) => {
            const name = activeCanvas.getName() || 'n/a';
            this.$activeObjectName.innerText = name;
            findElement(this.$canvasSidebar, '.object-name').innerText = name;
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
    }

    private syncDisplayModeControl(hasData?: boolean): void {
        const canvas = this.project?.getActiveCanvas();
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

        this.updateCanvasSidebarColors();

        this.$kangarooModeInput.disabled = !canvas.supportsKangarooMode();
    }

    private updateCanvasSidebarColors(): void {
        const canvas = this.project?.getActiveCanvas();
        if (!canvas) {
            return;
        }

        this.logger.debug('updating canvas sidebar colors');

        const palette = canvas.getColorPalette();
        const paletteSet = this.paletteSets.getPaletteSets().find(set => set.getPalettes().some(p => p === palette));
        if (!paletteSet) {
            throw new Error(`Could not find PaletteSet for ColorPalette{${palette.id}}`);
        }

        const displayMode = canvas.getDisplayMode();
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
        const index = Array.from($select.options).findIndex(option => option.value === palette.id.toString());
        if (index === -1) {
            throw new Error(`Palette{${palette.id}} not found in .canvas-palette-select <option>`);
        }

        // update palette <select> and swatch list
        $select.selectedIndex = index;

        // update color list
        this.updateCanvasSidebarColors();
    }

    private onCanvasDimensionsChanged(canvas: PixelCanvas): void {
        if (canvas !== this.project?.getActiveCanvas()) {
            return;
        }

        const { width, height } = canvas.getDimensions();
        this.$canvasWidthInput.value = width.toString();
        this.$canvasHeightInput.value = height.toString();

        findElement(this.$canvasSidebar, '.object-details .canvas-size').innerText = canvas ?
            width + '×' + height :
            '';
    }

    private onPixelDimensionsChanged(canvas: PixelCanvas): void {
        if (canvas !== this.project?.getActiveCanvas()) {
            return;
        }

        const { width, height } = canvas.getPixelDimensions();

        findElement(this.$canvasSidebar, '.object-details .pixel-size').innerText = canvas ?
            (width + '×' + height) :
            '';

        this.$pixelWidthInput.value = width.toString();
        this.$pixelHeightInput.value = height.toString();
    }

    public setPaletteSets(paletteSets: ColorPaletteSetCollection): void {
        this.paletteSets.off();

        this.paletteSets = paletteSets;
        this.paletteSets.on('color_change', (paletteSet, palette, color, index) => {
            this.project?.updatePaletteColor(palette, index);
            this.updateCanvasSidebarColors();
        });
        this.paletteSets.on('bg_select', (paletteSet, color) => {
            this.project?.setBackgroundColor(color);
            this.updateCanvasSidebarColors();
        });
    }

    private setActiveColor(colorValue: DisplayModeColorIndex): void {
        const canvas = this.project?.getActiveCanvas();
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
        this.updateCanvasSidebarColors();
    }

    private onKangarooModeChanged(): void {
        this.updateKangarooModeUI();
        this.settings.uncoloredPixelBehavior = this.settings.kangarooMode ? 'background' : 'transparent';
        this.onUncoloredPixelBehaviorChanged();
        this.project?.updateKangarooMode();
    }

    private updateUncolorPixelBehaviorUI(): void {
        this.$transparentInput.checked = this.settings.uncoloredPixelBehavior === 'transparent';
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
                const defaultColorPalette = this.settings.activeColorPaletteSet.getPalettes()[0];
                if (!defaultColorPalette) {
                    throw new Error(`Could not find default color palette in ` +
                        `ColorPaletteSet{${this.settings.activeColorPaletteSet.id}}`);
                }

                this.project?.addObject({
                    mountEl: this.$canvasArea,
                    width: 16,
                    height: 16,
                    pixelHeight: 8,
                    pixelWidth: 8,
                    editorSettings: this.settings,
                    displayMode: DisplayMode.ModeNone,
                    palette: defaultColorPalette,
                    group: new ObjectGroup({
                        paletteSet: this.settings.activeColorPaletteSet,
                    }),
                });
            });
        });

        findElement(this.$projectControls, '.save-btn').addEventListener('click', () => {
            this.save();
        });

        const $loadFileInput = findInput(this.$projectControls, '.load-btn input[type="file"]');
        $loadFileInput.addEventListener('change', async () => {
            const { files } = $loadFileInput;
            const file = files?.[0];
            if (!file) {
                return;
            }

            const sizeKb = (file.size / 1024).toFixed(1);
            this.logger.info(`selected file ${file.name} (${file.type}), ${sizeKb}KB`);

            if (file.type !== 'application/gzip') {
                // assume it's JSON
                this.load(await file.text());
            } else {
                this.load(await file.arrayBuffer());
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

        canvasContainer.addEventListener('wheel', (e) => {
            if (e.deltaY === 0) {
                return;
            }

            const dir = e.deltaY < 0 ? 1 : -1;

            if (e.shiftKey) {
                const canvas = this.project?.getActiveCanvas();
                const { width: oldWidth, height: oldHeight } = canvas?.getHTMLRect() || { width: 0, height: 0 };

                this.settings.zoomLevel = Math.max(1, Math.min(10, this.settings.zoomLevel + dir));

                this.updateZoomLevelUI();
                this.project?.zoomTo();

                if (canvas) {
                    adjustCanvasPositionRelativeToCursor(canvas, e.clientX, e.clientY, oldWidth, oldHeight);
                }

                return;
            }

            // select prev/next color
            const activeCanvas = this.project?.getActiveCanvas();
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

            if (
                (e.target instanceof HTMLInputElement && ignoredInputs[e.target.type]) ||
                e.target instanceof HTMLTextAreaElement
            ) {
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

            if (e.shiftKey && (e.code === 'Numpad0' || e.code === 'Digit0')) {
                const canvas = this.project?.getActiveCanvas();
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
                const activeCanvas = this.project?.getActiveCanvas();
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

            if (e.key.toLowerCase() === 'p') {
                // must prevent default so that we don't type a "p" in the input
                e.preventDefault();
                this.$pixelWidthInput.focus();
                return;
            }

            if (e.key.toLowerCase() === 'c') {
                // must prevent default so that we don't type a "c" in the input
                e.preventDefault();
                this.$canvasWidthInput.focus();
                return;
            }

            if (e.key.toLowerCase() === 't') {
                this.settings.uncoloredPixelBehavior = this.settings.uncoloredPixelBehavior === 'transparent' ?
                    'background' :
                    'transparent';
                this.onUncoloredPixelBehaviorChanged();
                return;
            }

            if (e.key.toLowerCase() === 'k') {
                if (this.project?.getActiveCanvas()?.supportsKangarooMode()) {
                    this.settings.kangarooMode = !this.settings.kangarooMode;
                    this.onKangarooModeChanged();
                }
                return;
            }

            if (/^\d$/.test(e.key)) {
                const canvas = this.project?.getActiveCanvas();
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

        this.$transparentInput.addEventListener('change', () => {
            this.settings.uncoloredPixelBehavior = this.$transparentInput.checked ? 'transparent' : 'background';
            this.onUncoloredPixelBehaviorChanged();
        });

        this.$kangarooModeInput.addEventListener('change', () => {
            this.settings.kangarooMode = this.$kangarooModeInput.checked;
            this.onKangarooModeChanged();
        });

        findElement(this.$gutter, '.zoom-level-label').addEventListener('click', () => {
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
                    actions: 'ok',
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
                    actions: 'ok',
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
            const paletteId = Number($paletteSelect.value);
            const palette = this.settings.activeColorPaletteSet.getPalettes().find(palette => palette.id === paletteId);
            if (!palette) {
                this.logger.error(`selected palette ${paletteId} not found in active ColorPaletteSet`);
                return;
            }

            this.project?.setColorPalette(palette);
        });

        this.updateZoomLevelUI();
        this.initialized = true;
    }

    private applyCurrentCheckpoint(redo = false): void {
        const canvas = this.project?.getActiveCanvas();
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

    public save(): void {
        const json = this.toJSON();
        const stringified = JSON.stringify(json);

        const blobStream = new Blob([ stringified ]).stream();

        const compressedStream = blobStream.pipeThrough(new CompressionStream('gzip'));
        new Response(compressedStream)
            .blob()
            .then(blob => blob.arrayBuffer())
            .then((buffer) => {
                const bytes = new Uint8Array(buffer);
                const base64 = window.btoa(String.fromCharCode(...bytes));
                const filename = `antrax.json.gz`;
                const anchor = document.createElement('a');
                anchor.download = filename;
                anchor.href = 'data:application/gzip;base64,' + base64;
                anchor.target = '_blank';
                anchor.click();
            });
    }

    public load(data: string | ArrayBuffer | Blob): void {
        let json: object;
        if (typeof data === 'string') {
            try {
                json = JSON.parse(data);
            } catch (err) {
                this.logger.error(err);
                return;
            }

            this.loadJson(json);
        } else {
            if (!(data instanceof Blob)) {
                data = new Blob([ data ]);
            }

            this.logger.debug(`attempting to decompress assumed gzip stream`);
            const stream = data.stream();
            const decompressedStream = stream.pipeThrough(new DecompressionStream('gzip'));
            new Response(decompressedStream)
                .blob()
                .then(blob => {
                    this.logger.debug(`file inflated to ${(blob.size / 1024).toFixed(1)}KB`);
                    return blob.text();
                })
                .then((stringified) => {
                    try {
                        json = JSON.parse(stringified);
                    } catch (err) {
                        this.logger.error(err);
                        return;
                    }

                    this.loadJson(json);
                })
                .catch((err) => {
                    this.logger.error(err);
                });
        }
    }

    private isSerialized(json: object): json is EditorSerialized {
        if (typeof (json as EditorSerialized).project !== 'object') {
            return false;
        }
        if (typeof (json as EditorSerialized).paletteSetCollection !== 'object' || !(json as EditorSerialized).paletteSetCollection) {
            return false;
        }
        if (!this.validateSettings((json as EditorSerialized).settings)) {
            return false;
        }

        return true;
    }

    private validateSettings(settings: any): settings is EditorSettings {
        if (typeof settings !== 'object') {
            return false;
        }
        if (!settings) {
            return false;
        }

        if (
            (typeof settings.uncoloredPixelBehavior !== 'string' &&
                typeof settings.uncoloredPixelBehavior !== 'undefined') ||
            typeof settings.showGrid !== 'boolean' ||
            typeof settings.zoomLevel !== 'number' ||
            typeof settings.activeColorPaletteSetId !== 'number' ||
            (typeof settings.kangarooMode !== 'boolean' &&
                typeof settings.kangarooMode !== 'undefined')
        ) {
            return false;
        }

        return true;
    }

    public loadJson(json: object): void {
        this.logger.info(`loading JSON`, json);

        if (!this.isSerialized(json)) {
            throw new Error(`JSON is invalid, cannot deserialize`);
        }

        const paletteMountEl = findElement(this.$el, '.content-header');

        const paletteSets = json.paletteSetCollection.paletteSets.map(setJson => ColorPaletteSet.fromJSON(setJson, paletteMountEl));
        if (!paletteSets.length) {
            paletteSets.push(new ColorPaletteSet({
                mountEl: paletteMountEl,
            }));
        }

        let activeColorPaletteSet = paletteSets.find(set => set.id === json.settings.activeColorPaletteSetId);
        if (!activeColorPaletteSet) {
            this.logger.warn(`ColorPaletteSet{${json.settings.activeColorPaletteSetId}} not found`);
            activeColorPaletteSet = paletteSets[0];
            if (!activeColorPaletteSet) {
                throw new Error(`no ColorPaletteSets, this is a developer error`);
            }
        }

        this.paletteSets.destroy();
        this.project?.destroy();

        this.settings = {
            zoomLevel: json.settings.zoomLevel,
            showGrid: json.settings.showGrid,
            activeColorPaletteSet,
            uncoloredPixelBehavior: json.settings.uncoloredPixelBehavior || 'transparent',
            kangarooMode: json.settings.kangarooMode || false,
        };

        const paletteSetCollection = ColorPaletteSetCollection.fromJSON(
            json.paletteSetCollection,
            this.settings,
            paletteSets,
        );
        this.setPaletteSets(paletteSetCollection);

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
        this.paletteSets.init();
        this.project?.init();
        this.updateZoomLevelUI();
        this.updateGridUI();
        this.updateUncolorPixelBehaviorUI();
        this.updateKangarooModeUI();
    }
}
