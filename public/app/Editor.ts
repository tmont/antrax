import type { ColorPaletteSet } from './ColorPaletteSet.ts';
import { ColorPaletteSetCollection } from './ColorPaletteSetCollection.ts';
import { Modal } from './Modal.ts';
import type { Project } from './Project.ts';
import { findElement, findOrDie } from './utils.ts';

export interface EditorOptions {
    showGrid?: boolean;
    zoomLevel?: number;
    project: Project;
    mountEl: HTMLElement;
    paletteSets: ColorPaletteSet[];
}

const infoContent = `
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
                <td><kbd>Shift</kbd>+<kbd>0</kbd></td>
                <td>Reset zoom level to <strong>1x</strong></td>
            </tr>
        </table>
    </section>
    <section>
        <header>Canvas interactions</header>
        <table>
            <tr>
                <td>Scrollwheel</td>
                <td>Zoom in/out by <strong>0.1</strong></td>
            </tr>
            <tr>
                <td><kbd>Shift</kbd>+Scrollwheel</td>
                <td>Zoom in/out by <strong>0.5</strong></td>
            </tr>
            <tr>
                <td><kbd>Shift</kbd>+Left click &amp; drag</td>
                <td>Pan canvas</td>
            </tr>
            <tr>
                <td><kbd>Ctrl</kbd>+Left click</td>
                <td>Erase pixel</td>
            </tr>
        </table>
    </section>
</div>
<div class="col">
    <section>
        <header>Colors &amp; palettes</header>
        <table>
            <tr>
                <td><kbd>Shift</kbd>+Left click</td>
                <td>Open palette color picker</td>
            </tr>
            <tr>
                <td>Left click</td>
                <td>Open background color picker</td>
            </tr>
            <tr>
                <td>Left click</td>
                <td>Select palette color</td>
            </tr>
        </table>
    </section>
</div>
`;

export class Editor {
    private showGrid: boolean;
    private zoomLevel: number;
    private project: Project;
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
    private initialized = false;

    private readonly paletteSets: ColorPaletteSetCollection;

    public constructor(options: EditorOptions) {
        this.showGrid = typeof options.showGrid === 'boolean' ? options.showGrid : false;
        this.zoomLevel = options.zoomLevel || 2;
        this.$el = options.mountEl;

        this.paletteSets = new ColorPaletteSetCollection({
            mountEl: findElement(this.$el, '.content-header'),
            paletteSets: options.paletteSets,
        });

        this.$gutter = findElement(this.$el, '.canvas-gutter');
        this.$gridInput = findOrDie(this.$gutter, '#option-show-grid', node => node instanceof HTMLInputElement);
        this.$zoomValue = findElement(this.$gutter, '.zoom-level-value');
        this.$pixelWidthInput = findOrDie(this.$gutter, '#option-pixel-width', node => node instanceof HTMLInputElement);
        this.$pixelHeightInput = findOrDie(this.$gutter, '#option-pixel-height', node => node instanceof HTMLInputElement);
        this.$canvasWidthInput = findOrDie(this.$gutter, '#option-canvas-width', node => node instanceof HTMLInputElement);
        this.$canvasHeightInput = findOrDie(this.$gutter, '#option-canvas-height', node => node instanceof HTMLInputElement);
        this.$canvasCoordinates = findElement(this.$gutter, '.current-coordinates');
        this.$activeGroupName = findElement(this.$gutter, '.breadcrumb .active-group-name');
        this.$activeObjectName = findElement(this.$gutter, '.breadcrumb .active-object-name');

        this.project = options.project;
        this.setProject(options.project);
    }

    public setProject(project: Project): void {
        // disable events on previously active project
        this.project.off();

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
        this.project.on('pixel_draw', (e) => {
            if (e.behavior === 'user') {
                this.$canvasCoordinates.innerText = `${e.row},${e.col}`;
            }
        });
        this.project.on('active_object_name_change', (activeCanvas) => {
            this.$activeObjectName.innerText = activeCanvas.getName() || 'n/a';
        });
    }

    public updateZoomLevelUI(): void {
        this.$zoomValue.innerText = this.zoomLevel + 'x';
    }

    public init(): void {
        if (this.initialized) {
            return;
        }

        this.paletteSets.init();
        this.project.init();
        this.paletteSets.on('color_select', (paletteSet, palette, color, index) => {
            this.project.setActiveColor(paletteSet, palette, color, index);
        });
        this.paletteSets.on('color_change', (paletteSet, palette, color, index) => {
            this.project.setActiveColor(paletteSet, palette, color, index);
            this.project.updatePaletteColor(palette, index);
        });
        this.paletteSets.on('bg_select', (paletteSet, color) => {
            this.project.setBackgroundColor(color);
        });

        // ensure that the absolutely positioned canvases are correctly aligned after a window resize
        window.addEventListener('resize', (() => {
            let debounceId: number | null = null;

            return () => {
                if (debounceId) {
                    window.clearTimeout(debounceId);
                    debounceId = null;
                }

                window.setTimeout(() => {
                    this.project.onResize();
                }, 150);
            };
        })());

        const canvasContainer = findElement(this.$el, '.canvas-container');
        const canvasArea = findElement(this.$el, '.canvas-area');
        let panning = false;
        let panningOrigin = { x: 0, y: 0 };

        canvasContainer.addEventListener('wheel', (e) => {
            const coefficient = e.shiftKey ? 0.5 : 0.1;
            const delta = e.deltaY < 0 ? 1 : (e.deltaY > 0 ? -1 : 0);
            this.zoomLevel += (delta * coefficient);
            this.zoomLevel = Math.round(this.zoomLevel * 100) / 100;
            this.zoomLevel = Math.max(0.1, Math.min(10, this.zoomLevel));

            this.updateZoomLevelUI();
            this.project.zoomTo(this.zoomLevel);
        });

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

            if (e.shiftKey && (e.code === 'Numpad0' || e.code === 'Digit0')) {
                this.zoomLevel = 1;
                this.updateZoomLevelUI();
                this.project.zoomTo(this.zoomLevel);
            } else if (e.key.toLowerCase() === 'g') {
                this.showGrid = !this.showGrid;
                this.project.setShowGrid(this.showGrid);
                this.$gridInput.checked = this.showGrid;
            } else if (e.key.toLowerCase() === 'p') {
                this.$pixelWidthInput.focus();
            } else if (e.key.toLowerCase() === 'c') {
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

            const computedStyle = window.getComputedStyle(canvasArea);
            const currentX = parseInt(computedStyle.getPropertyValue('left'));
            const currentY = parseInt(computedStyle.getPropertyValue('top'));

            panningOrigin = { x: clientX, y: clientY };

            canvasArea.style.top = (currentY + deltaY) + 'px';
            canvasArea.style.left = (currentX + deltaX) + 'px';
        });

        document.addEventListener('mouseup', () => {
            panning = false;
            canvasContainer.classList.remove('panning-start', 'panning');
        });

        // gutter stuff
        this.$gridInput.addEventListener('change', () =>{
            this.project.setShowGrid(this.$gridInput.checked);
        });

        findElement(this.$gutter, '.zoom-level-label').addEventListener('click', () => {
            this.zoomLevel = 1;
            this.updateZoomLevelUI();
            this.project.zoomTo(this.zoomLevel);
        });

        const inputs: [ HTMLInputElement, (value: number) => void ][] = [
            [ this.$pixelWidthInput, value => this.project.setPixelDimensions(value, null) ],
            [ this.$pixelHeightInput, value => this.project.setPixelDimensions(null, value) ],
            [ this.$canvasWidthInput, value => this.project.setCanvasDimensions(value, null) ],
            [ this.$canvasHeightInput, value => this.project.setCanvasDimensions(null, value) ],
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
}
