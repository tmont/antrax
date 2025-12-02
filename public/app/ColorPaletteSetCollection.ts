import { ColorPalette, colorPaletteTmpl } from './ColorPalette.ts';
import { ColorPaletteSet, type ColorPaletteSetSerialized } from './ColorPaletteSet.ts';
import type { Atari7800Color } from './colors.ts';
import { EventEmitter } from './EventEmitter.ts';
import { Logger } from './Logger.ts';
import { Popover } from './Popover.ts';
import {
    type ColorIndex,
    type ColorPaletteSetCollectionStats,
    findElement,
    findInput,
    parseTemplate,
    type StatsReceiver
} from './utils.ts';

export interface ColorPaletteSetCollectionOptions {
    paletteSets: ColorPaletteSet[];
    activePaletteSet: ColorPaletteSet | null;
}

export interface ColorPaletteSetCollectionSerialized {
    paletteSets: ColorPaletteSetSerialized[];
}

export type ColorPaletteSetCollectionEventMap = {
    color_change: [ ColorPaletteSet, ColorPalette, Atari7800Color, ColorIndex ];
    bg_select: [ ColorPaletteSet, Atari7800Color ];
    palette_set_select: [ ColorPaletteSet ];
}

const dropdownTmpl = `
<div class="palette-set-dropdown dropdown-menu">
    <table class="hoverable borderless selectable"></table>
    <form class="dropdown-item add-palette-set-item">
        <button type="submit" class="btn btn-sm btn-success">
            <i class="fa-solid fa-add"></i>
            New palette set
        </button>
    </form>
</div>
`;

const dropdownRowCells = `
<td class="active-indicator"><i class="fa-solid fa-check"></i></td>
<td>
    <div class="editing-container">
        <span class="palette-set-name"></span>
        <button type="button" class="btn btn-xs btn-tertiary palette-set-overflow-btn">
            <i class="fa-solid fa-ellipsis-h"></i>
        </button>
    </div>
</td>
<td>
    <div class="palette-list">
        <div class="color-palette-container bg-color-container">
            <header class="color-palette-name">BG</header>
            <div class="color-swatch-list">
                <div class="color-swatch" data-index="0"></div>
            </div>
        </div>
    </div>
</td>
`;

const paletteSetOverflowTmpl = `
<ul class="list-unstyled dropdown-menu">
    <li class="dropdown-item"><a href="#" data-action="edit"><i class="fa-solid fa-fw fa-pencil icon"></i>Edit&hellip;</a></li>
    <li class="dropdown-item divider"></li>
    <li class="dropdown-item"><a href="#" data-action="delete" class="text-danger"><i class="fa-solid fa-fw fa-trash icon"></i>Delete&hellip;</a></li>
</ul>
`;

const editPaletteSetTmpl = `
<form class="form-vertical">
    <div class="form-row">
        <input class="name-input form-control" type="text" maxlength="50" minlength="1" placeholder="Name" required />
    </div>
    <div class="submit-container">
        <button type="submit" class="btn btn-primary">Save</button>
    </div>
</form>
`;

export class ColorPaletteSetCollection extends EventEmitter<ColorPaletteSetCollectionEventMap> implements StatsReceiver<ColorPaletteSetCollectionStats> {
    private readonly paletteSets: ColorPaletteSet[] = [];
    private initialized = false;
    private readonly logger: Logger;
    private activePaletteSet: ColorPaletteSet | null = null;
    private readonly $popoverTmpl: HTMLElement;
    private readonly $paletteListTmpl: HTMLElement;
    private readonly $overflowTmpl: HTMLElement;

    public constructor(options: ColorPaletteSetCollectionOptions) {
        super();
        this.logger = Logger.from(this);
        this.paletteSets = options.paletteSets;
        this.$popoverTmpl = parseTemplate(dropdownTmpl);
        this.$paletteListTmpl = parseTemplate(colorPaletteTmpl);
        this.$overflowTmpl = parseTemplate(paletteSetOverflowTmpl);

        this.activatePaletteSet(options.activePaletteSet);
    }

    public get name(): string {
        return 'ColorPaletteSetCollection';
    }

    public getPaletteSets(): Readonly<ColorPaletteSet[]> {
        return this.paletteSets;
    }

    public init(): void {
        if (this.initialized) {
            return;
        }

        this.logger.debug('initializing');
        this.paletteSets.forEach(paletteSet => this.wireUpPaletteSet(paletteSet));
        this.initialized = true;
    }

    private wireUpPaletteSet(paletteSet: ColorPaletteSet): void {
        const $popoverContent = this.$popoverTmpl;
        const $paletteList = this.$paletteListTmpl;
        const $overflowContent = this.$overflowTmpl;

        paletteSet.init();
        paletteSet.on('color_change', (palette, color, index) => {
            this.emit('color_change', paletteSet, palette, color, index);
        });
        paletteSet.on('bg_select', (color) => {
            this.emit('bg_select', paletteSet, color);
        });
        paletteSet.on('overflow_click', ($el) => {
            const $container = $popoverContent.cloneNode(true) as typeof $popoverContent;
            const $table = findElement($container, 'table');
            const $addForm = findElement($container, '.add-palette-set-item');

            const appendRow = (set: ColorPaletteSet) => {
                const $contentRow = document.createElement('tr');
                $contentRow.innerHTML = dropdownRowCells;
                $contentRow.setAttribute('data-palette-set-id', set.id);
                findElement($contentRow, '.palette-set-name').innerText = set.getName();

                $contentRow.classList.toggle('active', this.activePaletteSet === set);

                const $info = findElement($contentRow, '.palette-list');
                findElement($info, '.bg-color-container .color-swatch').style.backgroundColor = set.getBackgroundColor().hex;

                set.getPalettes().forEach((palette) => {
                    const $palette = $paletteList.cloneNode(true) as typeof $paletteList;
                    findElement($palette, '.color-palette-name').innerText = palette.name;

                    palette.colors.forEach((color, i) => {
                        const $swatch = findElement($palette, `[data-index="${i}"]`);
                        $swatch.style.backgroundColor = color.hex;
                        $swatch.classList.remove('selectable');
                    });

                    $info.appendChild($palette);
                });

                $table.appendChild($contentRow);
            };

            $addForm.addEventListener('submit', (e) => {
                e.preventDefault();

                const newPaletteSet = new ColorPaletteSet({
                    mountEl: findElement(document.body, '.content-header'),
                });

                this.paletteSets.push(newPaletteSet);
                this.wireUpPaletteSet(newPaletteSet);
                newPaletteSet.deactivate();

                appendRow(newPaletteSet);
            });

            // create dropdown rows
            this.paletteSets.forEach(appendRow);

            const popover = new Popover({
                content: $container,
                arrowAlign: 'center',
                dropdown: true,
            });

            popover.on('show', () => {
                paletteSet.setOpenState(true);
            });
            popover.on('hide', () => {
                paletteSet.setOpenState(false);
            });

            $container.addEventListener('click', (e) => {
                const target = e.target;
                if (!(target instanceof HTMLElement)) {
                    return;
                }

                const $row = target.closest('[data-palette-set-id]');
                if (!$row) {
                    return;
                }

                const paletteSetId = String($row?.getAttribute('data-palette-set-id'));
                const selectedPaletteSet = this.paletteSets.find(p => p.id === paletteSetId);
                if (!selectedPaletteSet) {
                    return;
                }

                e.preventDefault();

                const $overflowBtn = target.closest('.palette-set-overflow-btn');
                if (!$overflowBtn) {
                    // overflow button was not clicked, select the new palette set
                    popover.hide();
                    this.emit('palette_set_select', selectedPaletteSet);
                    return;
                }

                // show overflow content
                const $cloned = $overflowContent.cloneNode(true) as typeof $overflowContent;
                const overflowPopover = new Popover({
                    dropdown: true,
                    content: $cloned,
                });

                $cloned.querySelectorAll('.dropdown-item a').forEach((anchor) => {
                    const $editContent = parseTemplate(editPaletteSetTmpl) as HTMLFormElement;
                    const $nameInput = findInput($editContent, '.name-input');

                    const editPopover = new Popover({
                        content: $editContent,
                        arrowAlign: 'center',
                        title: 'Edit palette set',
                    });

                    $editContent.addEventListener('submit', (e) => {
                        e.preventDefault();

                        selectedPaletteSet.setName($nameInput.value);
                        const $rowName = findElement($row, `.palette-set-name`);
                        $rowName.innerText = selectedPaletteSet.getName();
                        editPopover.hide();
                    });

                    const action = anchor.getAttribute('data-action');
                    if (action === 'delete') {
                        // cannot delete a palette set unless nothing is using it
                        anchor.classList.toggle('disabled', selectedPaletteSet.stats.objectCount > 0);
                    }

                    anchor.addEventListener('click', (e) => {
                        e.preventDefault();
                        overflowPopover.hide();

                        switch (action) {
                            case 'edit':
                                editPopover.setTitle(`Edit ${selectedPaletteSet.getName()}`);
                                $nameInput.value = selectedPaletteSet.getName();
                                editPopover.show($overflowBtn);
                                $nameInput.focus();
                                break;
                            case 'delete':
                                overflowPopover.hide();
                                this.deletePaletteSet(selectedPaletteSet);
                                $row.remove();
                                break;
                        }
                    });
                });

                overflowPopover.show(target);
            });

            popover.show($el);
        });
    }

    public updateStats(stats: ColorPaletteSetCollectionStats) {
        stats.paletteSetStats.forEach((stat, paletteSet) => paletteSet.updateStats(stat));
    }

    public deletePaletteSet(paletteSet: ColorPaletteSet): boolean {
        const index = this.paletteSets.indexOf(paletteSet);
        if (index === -1) {
            this.logger.warn(`ColorPaletteSet{${paletteSet.id}} not in palette set collection, cannot delete`);
            return false;
        }

        this.paletteSets.splice(index, 1);

        Popover.toast({
            type: 'success',
            content: `Palette set "${paletteSet.getName()}" successfully deleted`,
        });

        return true;
    }

    public destroy(): void {
        this.paletteSets.forEach(paletteSet => paletteSet.destroy());
    }

    public activatePaletteSet(activePaletteSet: ColorPaletteSet | null): void {
        if (activePaletteSet && this.paletteSets.indexOf(activePaletteSet) === -1) {
            this.logger.warn(`activated palette set not found in array`);
        }

        this.logger.debug(`activating palette set ${activePaletteSet?.id || '[none]'}`);
        this.activePaletteSet = activePaletteSet;
        this.paletteSets.forEach((paletteSet) => {
            if (paletteSet === this.activePaletteSet) {
                paletteSet.activate();
            } else {
                paletteSet.deactivate();
            }
        });
    }

    public toJSON(): ColorPaletteSetCollectionSerialized {
        return {
            paletteSets: this.paletteSets.map(set => set.toJSON()),
        };
    }
}
