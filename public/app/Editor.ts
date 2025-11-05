import { type ColorIndex, ColorPalette } from './ColorPalette.ts';
import { ColorPaletteSet } from './ColorPaletteSet.ts';
import { ColorPaletteSetCollection, type ColorPaletteSetCollectionSerialized } from './ColorPaletteSetCollection.ts';
import { Logger } from './Logger.ts';
import { Modal } from './Modal.ts';
import { ObjectGroup } from './ObjectGroup.ts';
import { PixelCanvas } from './PixelCanvas.ts';
import { Project, type ProjectSerialized } from './Project.ts';
import { findElement, findOrDie } from './utils.ts';

export interface EditorSettings {
    showGrid: boolean;
    zoomLevel: number;
    pixelWidth: number;
    pixelHeight: number;
    canvasWidth: number;
    canvasHeight: number;
    activeColorPaletteSet: ColorPaletteSet;
    activeColorPalette: ColorPalette;
    activeColorIndex: ColorIndex;
}

export interface EditorSettingsSerialized extends
    Pick<EditorSettings, 'showGrid' | 'zoomLevel' | 'pixelWidth' | 'pixelHeight' | 'canvasWidth' | 'canvasHeight' | 'activeColorIndex'> {
    activeColorPaletteSetId: ColorPaletteSet['id'];
    activeColorPaletteId: ColorPalette['id'];
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

const infoContent = `
<div class="col">
    <section>
        <header>Canvas interactions</header>
        <table>
            <tr>
                <td>Scrollwheel</td>
                <td>Zoom in/out by <strong>0.1</strong></td>
            </tr>
            <tr>
                <td><kbd>Shift</kbd> + Scrollwheel</td>
                <td>Zoom in/out by <strong>0.5</strong></td>
            </tr>
            <tr>
                <td><kbd>Shift</kbd> + Left click &amp; drag</td>
                <td>Pan canvas</td>
            </tr>
            <tr>
                <td><kbd>Ctrl</kbd> + Left click</td>
                <td>Erase pixel</td>
            </tr>
        </table>
    </section>
    <section>
        <header>Colors &amp; palettes</header>
        <table>
            <tr>
                <td><kbd>Shift</kbd> + Left click</td>
                <td>Open palette color picker</td>
            </tr>
            <tr>
                <td>Left click</td>
                <td>Open background color picker</td>
            </tr>
            <tr>
                <td>
                    <p>Left click</p>
                    <p><kbd>1-8</kbd> &rarr; <kbd>1-3</kbd></p>
                </td>
                <td>Select palette color</td>
            </tr>
        </table>
    </section>
</div>
<div class="col">
    <section>
        <header>Keyboard shortcuts</header>
        <table>
            <tr>
                <td><kbd>G</kbd></td>
                <td>Toggle grid</td>
            </tr>
            <tr>
                <td><kbd>P</kbd></td>
                <td>Update pixel dimensions</td>
            </tr>
            <tr>
                <td><kbd>C</kbd></td>
                <td>Update canvas dimensions</td>
            </tr>
            <tr>
                <td><kbd>Shift</kbd> + <kbd>0</kbd></td>
                <td>Reset zoom level to <strong>1x</strong></td>
            </tr>
            <tr>
                <td><kbd>Ctrl</kbd> + <kbd>Z</kbd></td>
                <td>Undo last draw action</td>
            </tr>
            <tr>
                <td>
                    <p><kbd>Ctrl</kbd> + <kbd>Y</kbd></p>
                    <p><kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Z</kbd></p>
                </td>
                <td>Redo last draw action</td>
            </tr>
        </table>
    </section>
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
    private initialized = false;
    private settings: EditorSettings;

    private paletteSets: ColorPaletteSetCollection;
    private undoContext: Record<PixelCanvas['id'], UndoContext> = {};

    public constructor(options: EditorOptions) {
        this.$el = options.mountEl;

        this.logger = Logger.from(this);

        this.$gutter = findElement(this.$el, '.canvas-gutter');
        this.$canvasArea = findElement(this.$el, '.canvas-area');
        this.$gridInput = findOrDie(this.$gutter, '#option-show-grid', node => node instanceof HTMLInputElement);
        this.$zoomValue = findElement(this.$gutter, '.zoom-level-value');
        this.$pixelWidthInput = findOrDie(this.$gutter, '#option-pixel-width', node => node instanceof HTMLInputElement);
        this.$pixelHeightInput = findOrDie(this.$gutter, '#option-pixel-height', node => node instanceof HTMLInputElement);
        this.$canvasWidthInput = findOrDie(this.$gutter, '#option-canvas-width', node => node instanceof HTMLInputElement);
        this.$canvasHeightInput = findOrDie(this.$gutter, '#option-canvas-height', node => node instanceof HTMLInputElement);
        this.$canvasCoordinates = findElement(this.$gutter, '.current-coordinates');
        this.$activeGroupName = findElement(this.$gutter, '.breadcrumb .active-group-name');
        this.$activeObjectName = findElement(this.$gutter, '.breadcrumb .active-object-name');
        this.$projectControls = findElement(this.$el, '.project-controls');

        const defaultPaletteSet = options.paletteSets[0];
        if (!defaultPaletteSet) {
            throw new Error(`paletteSets cannot be empty`);
        }

        const defaultPalette = defaultPaletteSet.getPalettes()[0];

        if (!defaultPalette) {
            throw new Error(`could not find default color palette in set ${defaultPaletteSet.id}`);
        }

        this.settings = options.settings || {
            pixelWidth: 8,
            pixelHeight: 8,
            canvasWidth: 20,
            canvasHeight: 20,
            showGrid: false,
            zoomLevel: 2,
            activeColorIndex: 0,
            activeColorPalette: defaultPalette,
            activeColorPaletteSet: defaultPaletteSet,
        };

        this.paletteSets = new ColorPaletteSetCollection({
            paletteSets: options.paletteSets,
            editorSettings: this.settings,
        });

        this.setPaletteSets(this.paletteSets);
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
            const { width: pixelWidth, height: pixelHeight } = activeCanvas?.getPixelDimensions() || { width: 0, height: 0 };
            const { width: canvasWidth, height: canvasHeight } = activeCanvas?.getDimensions() || { width: 0, height: 0 };

            this.$pixelWidthInput.value = (pixelWidth || '').toString();
            this.$pixelHeightInput.value = (pixelHeight || '').toString();
            this.$canvasWidthInput.value = (canvasWidth || '').toString();
            this.$canvasHeightInput.value = (canvasHeight || '').toString();

            this.$activeGroupName.innerText = activeCanvas?.group.name || 'n/a';
            this.$activeObjectName.innerText = activeCanvas?.getName() || 'n/a';

            this.$canvasCoordinates.innerText = `0,0`;
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
        });
        this.project.on('draw_start', (canvas) => {
            pushUndoItem(canvas);
        });
        this.project.on('active_object_name_change', (activeCanvas) => {
            this.$activeObjectName.innerText = activeCanvas.getName() || 'n/a';
        });
        this.project.on('color_select', (paletteSet, palette, index) => {
            paletteSet.setActiveColor(palette, index);
            this.setActiveColor(paletteSet, palette, index);
        });
    }

    public setPaletteSets(paletteSets: ColorPaletteSetCollection): void {
        this.paletteSets.off();

        this.paletteSets = paletteSets;
        this.paletteSets.on('color_select', (paletteSet, palette, color, index) => {
            this.setActiveColor(paletteSet, palette, index);
        });
        this.paletteSets.on('color_change', (paletteSet, palette, color, index) => {
            this.setActiveColor(paletteSet, palette, index);
            this.project?.updatePaletteColor(palette, index);
        });
        this.paletteSets.on('bg_select', (paletteSet, color) => {
            this.project?.setBackgroundColor(color);
        });
    }

    private setActiveColor(paletteSet: ColorPaletteSet, palette: ColorPalette, index: ColorIndex): void {
        const hex = palette.getColorAt(index).hex;
        this.logger.info(`active color set to PaletteSet{${paletteSet.id}}, ${palette.name}[${index}] (${hex})`);
        this.settings.activeColorPaletteSet = paletteSet;
        this.settings.activeColorPalette = palette;
        this.settings.activeColorIndex = index;
        this.project?.setActiveColor(paletteSet, palette, index);
    }

    public updateZoomLevelUI(): void {
        this.$zoomValue.innerText = this.settings.zoomLevel + 'x';
    }

    public updateGridUI(): void {
        this.$gridInput.checked = this.settings.showGrid;
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

        const newObjBtn = findElement(this.$projectControls, '.new-object-btn');

        newObjBtn.addEventListener('click', () => {
            this.project?.addObject({
                mountEl: this.$canvasArea,
                width: this.settings.canvasWidth,
                height: this.settings.canvasHeight,
                pixelHeight: this.settings.pixelHeight,
                pixelWidth: this.settings.pixelWidth,
                editorSettings: this.settings,
                group: new ObjectGroup({
                    paletteSet: this.settings.activeColorPaletteSet,
                }),
            });
        });

        findElement(this.$projectControls, '.save-btn').addEventListener('click', () => {
            this.save();
        });

        const $loadFileInput = findOrDie(this.$projectControls, '.load-btn input[type="file"]', node => node instanceof HTMLInputElement);
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
                this.load(await file.bytes());
            }
        });

        // ensure that the absolutely positioned canvases are correctly aligned after a window resize
        // TODO i believe this isn't necessary anymore since the canvas is now absolutely positioned
        window.addEventListener('resize', (() => {
            let debounceId: number | null = null;

            return () => {
                if (debounceId) {
                    window.clearTimeout(debounceId);
                    debounceId = null;
                }

                window.setTimeout(() => {
                    this.project?.onResize();
                }, 150);
            };
        })());

        const canvasContainer = findElement(this.$el, '.canvas-container');
        let panning = false;
        let panningOrigin = { x: 0, y: 0 };

        canvasContainer.addEventListener('wheel', (e) => {
            const coefficient = e.shiftKey ? 0.5 : 0.1;
            const delta = e.deltaY < 0 ? 1 : (e.deltaY > 0 ? -1 : 0);
            this.settings.zoomLevel += (delta * coefficient);
            this.settings.zoomLevel = Math.round(this.settings.zoomLevel * 100) / 100;
            this.settings.zoomLevel = Math.max(0.1, Math.min(10, this.settings.zoomLevel));

            this.updateZoomLevelUI();
            this.project?.zoomTo();
        });

        let chord2: string[] = [];
        let chordTimeoutId: number | null = null;
        document.addEventListener('keydown', (e) => {
            if (panning) {
                return;
            }

            if (e.target instanceof HTMLInputElement) {
                return;
            }

            if (e.shiftKey || e.key === 'Shift') {
                canvasContainer.classList.add('panning-start');
            }

            if (/^\d$/.test(e.key)) {
                if (chordTimeoutId) {
                    window.clearTimeout(chordTimeoutId);
                    chordTimeoutId = null;
                }

                chord2.push(e.key);
                while (chord2.length > 2) {
                    chord2.shift();
                }

                if (chord2.length === 2) {
                    const [ key1, key2 ] = chord2;
                    chord2 = [];

                    const paletteIndex = Number(key1);
                    const colorIndex = Number(key2);
                    if (paletteIndex >= 1 && paletteIndex <= 8 && (colorIndex >= 1 && colorIndex <= 3)) {
                        // select color in palette
                        const trueColorIndex: ColorIndex = colorIndex - 1 as any;
                        const set = this.settings.activeColorPaletteSet;
                        const palette = set?.getPalettes()[paletteIndex - 1];
                        const color = palette?.getColorAt(trueColorIndex);
                        if (set && palette && color) {
                            this.logger.info(`setting active color to ${color.hex} due to key chord ${key1},${key2}`);
                            this.setActiveColor(set, palette, trueColorIndex);
                            set.setActiveColor(palette, trueColorIndex);
                        }
                    }
                } else {
                    // clear chord after a little bit of time
                    chordTimeoutId = window.setTimeout(() => {
                        this.logger.info('clearing key chord');
                        chord2 = [];
                    }, 5000);
                }
            }

            if (e.ctrlKey && e.key.toLowerCase() === 'z') {
                this.applyCurrentCheckpoint(e.shiftKey);
                return;
            }
            if (e.ctrlKey && e.key.toLowerCase() === 'y') {
                this.applyCurrentCheckpoint(true);
                return;
            }

            if (e.shiftKey && (e.code === 'Numpad0' || e.code === 'Digit0')) {
                this.settings.zoomLevel = 1;
                this.updateZoomLevelUI();
                this.project?.zoomTo();
            } else if (e.key.toLowerCase() === 'g') {
                this.settings.showGrid = !this.settings.showGrid;
                this.project?.setShowGrid();
                this.$gridInput.checked = this.settings.showGrid;
            } else if (e.key.toLowerCase() === 'p') {
                // must prevent default so that we don't type a "p" in the input
                e.preventDefault();
                this.$pixelWidthInput.focus();
            } else if (e.key.toLowerCase() === 'c') {
                // must prevent default so that we don't type a "c" in the input
                e.preventDefault();
                this.$canvasWidthInput.focus();
            }
        });

        document.addEventListener('keyup', () => {
            canvasContainer.classList.remove('panning-start');
        });

        canvasContainer.addEventListener('mousedown', (e) => {
            if (!e.shiftKey) {
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
        this.$gridInput.addEventListener('change', () =>{
            this.settings.showGrid = this.$gridInput.checked;
            this.project?.setShowGrid();
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

            const max = Number(input.max) || Infinity;
            const min = Number(input.min) || -Infinity;

            let prevValue = parseInt(input.value) || 0;
            input.addEventListener('change', () => {
                const value = parseInt(input.value);
                if (isNaN(value) || value > max || value < min) {
                    input.value = (value > max ? max : (value < min ? min : prevValue)).toString();
                    setValue(Number(input.value));
                    return;
                }

                prevValue = value;
                setValue(value);
            });
        });

        findOrDie(document, '.help-link', node => node instanceof HTMLAnchorElement)
            .addEventListener('click', (e) => {
                e.preventDefault();

                const modal = Modal.create({
                    contentHtml: infoContent,
                    actions: 'ok',
                    title: 'Info',
                    type: 'default',
                });

                modal.on('action', () => {
                    modal.destroy();
                });
                modal.show();
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
                activeColorIndex: this.settings.activeColorIndex,
                activeColorPaletteId: this.settings.activeColorPalette.id,
                activeColorPaletteSetId: this.settings.activeColorPaletteSet.id,
                canvasWidth: this.settings.canvasWidth,
                canvasHeight: this.settings.canvasHeight,
                pixelWidth: this.settings.pixelWidth,
                pixelHeight: this.settings.pixelHeight,
                showGrid: this.settings.showGrid,
                zoomLevel: this.settings.zoomLevel,
            },
        };
    }

    public save(): void {
        const json = this.toJSON();
        // window.localStorage.setItem('last_save', JSON.stringify(json));
        const stringified = JSON.stringify(json);

        const blobStream = new Blob([ stringified ]).stream();

        const compressedStream = blobStream.pipeThrough(new CompressionStream('gzip'));
        new Response(compressedStream)
            .blob()
            .then(blob => blob.bytes())
            .then((bytes) => {
                const base64 = window.btoa(String.fromCharCode(...bytes));
                const filename = `antrax.json.gz`;
                const anchor = document.createElement('a');
                anchor.download = filename;
                anchor.href = 'data:application/gzip;base64,' + base64;
                anchor.target = '_blank';
                anchor.click();
            });
    }

    public load(data: string | Uint8Array<ArrayBuffer> | Blob): void {
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

    private validateSettings(settings: unknown): settings is EditorSettings {
        if (typeof settings !== 'object') {
            return false;
        }
        if (!settings) {
            return false;
        }
        const expectedKeys: Record<keyof EditorSettingsSerialized, 'number' | 'boolean'> = {
            activeColorPaletteId: 'number',
            activeColorPaletteSetId: 'number',
            canvasHeight: 'number',
            canvasWidth: 'number',
            pixelHeight: 'number',
            pixelWidth: 'number',
            showGrid: 'boolean',
            zoomLevel: 'number',
            activeColorIndex: 'number',
        };

        for (const [ key, type ] of Object.entries(expectedKeys)) {
            if (typeof (settings as any)[key] !== type) {
                return false;
            }
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
        let activeColorPalette: ColorPalette | null = null;
        if (activeColorPaletteSet) {
            activeColorPalette = activeColorPaletteSet
                .getPalettes()
                .find(palette => palette.id === json.settings.activeColorPaletteId) || null;

            if (!activeColorPalette) {
                this.logger.warn(`ColorPalette{${json.settings.activeColorPaletteId}} not found ` +
                    `in ColorPaletteSet{${json.settings.activeColorPaletteSetId}}`);
            }
        } else {
            this.logger.warn(`ColorPaletteSet{${json.settings.activeColorPaletteSetId}} not found`);
            activeColorPaletteSet = paletteSets[0];
            if (!activeColorPaletteSet) {
                throw new Error(`no ColorPaletteSets, this is a developer error`);
            }
            activeColorPalette = activeColorPaletteSet.getPalettes()[0] || null;
        }

        if (!activeColorPalette) {
            throw new Error(`ColorPaletteSet{${activeColorPaletteSet.id}} does not have any palettes`);
        }

        this.paletteSets.destroy();
        this.project?.destroy();

        this.settings = {
            activeColorIndex: json.settings.activeColorIndex,
            zoomLevel: json.settings.zoomLevel,
            showGrid: json.settings.showGrid,
            canvasWidth: json.settings.canvasWidth,
            canvasHeight: json.settings.canvasHeight,
            pixelWidth: json.settings.pixelWidth,
            pixelHeight: json.settings.pixelHeight,
            activeColorPalette,
            activeColorPaletteSet,
        };

        const paletteSetCollection = ColorPaletteSetCollection.fromJSON(json.paletteSetCollection, this.settings, paletteSets);
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
    }
}
