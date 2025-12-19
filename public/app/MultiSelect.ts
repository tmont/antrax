import { EventEmitter } from './EventEmitter.ts';
import { Logger } from './Logger.ts';
import { Popover } from './Popover.ts';
import { findElement, parseTemplate } from './utils-dom.ts';
import { chars } from './utils.ts';

const tmpl = `
<div class="multiselect">
    <button class="multiselect-target btn btn-tertiary multi">
        <div class="multiselect-target-label">
            <div class="label clamp-1"></div>
            <div class="extra"></div>
        </div>
        <i class="fa-solid fa-caret-down caret"></i>
    </button>
</div>
`;
const menuTmpl = `<ol class="list-unstyled multiselect-item-list dropdown-menu"></ol>`;

const itemTmpl = `
<li class="multiselect-item dropdown-item">
    <a href="#">
        <i class="fa-solid fa-check icon"></i>
        <div class="multiselect-item-label clamp-1"></div>
    </a>
</li>
`;

export interface MultiSelectOptions {
    $mount: HTMLElement;
    defaultLabel?: string;
}

export interface MultiSelectItemGroup {
    id: string;
    groupLabel: string;
}

export interface MultiSelectItemSingle {
    label: string;
    id: string;
    selected?: boolean;
    group?: MultiSelectItemGroup['groupLabel'];
}

export type MultiSelectItem = MultiSelectItemGroup | MultiSelectItemSingle;
type MultiSelectItemCollection = Array<MultiSelectItem | MultiSelectItemGroup>;

export const isItemGroup = (item: any): item is MultiSelectItemGroup =>
    typeof (item as MultiSelectItemGroup).groupLabel !== 'undefined';

type MultiSelectEventMap = {
    show: [];
    hide: [];
    select: [ MultiSelectItem ];
    unselect: [ MultiSelectItem ];
}

export class MultiSelect extends EventEmitter<MultiSelectEventMap> {
    private readonly $container: HTMLElement;
    private readonly $el: HTMLElement;
    private readonly $target: HTMLElement;
    private readonly $targetLabel: HTMLElement;
    private initialized = false;
    private readonly popover: Popover;
    private readonly $itemContainer: HTMLElement;
    private items: MultiSelectItemCollection = [];
    private readonly defaultLabel: string;
    private readonly logger: Logger;

    public constructor(options: MultiSelectOptions) {
        super();

        this.$container = options.$mount;
        this.defaultLabel = options.defaultLabel || `Choose${chars.ellipsis}`;
        this.$el = parseTemplate(tmpl);
        this.$target = findElement(this.$el, '.multiselect-target');
        this.$targetLabel = findElement(this.$el, '.multiselect-target-label');
        this.$itemContainer = parseTemplate(menuTmpl);
        this.popover = new Popover({
            dropdown: true,
            content: this.$itemContainer,
            arrowAlign: 'left',
            size: 'medium',
        });

        this.logger = Logger.from(this);
    }

    public get name(): string {
        return 'MultiSelect';
    }

    public init(): void {
        if (this.initialized) {
            return;
        }

        this.$target.addEventListener('click', () => this.show());
        this.updateTargetLabel();

        this.popover.on('hide', () => {
            this.$el.classList.remove('open');
            this.emit('hide');
        });
        this.popover.on('show', () => {
            this.$el.classList.add('open');
            this.emit('show');
        });

        this.$container.appendChild(this.$el);

        this.initialized = true;
    }

    public destroy(): void {
        this.logger.info('destroying');
        this.hide();
        this.$el.remove();
    }

    private updateTargetLabel(): void {
        const selectedItems = this.items
            .filter((item): item is MultiSelectItemSingle => !isItemGroup(item))
            .filter(item => item.selected);

        let label = this.defaultLabel;
        let extra = '';
        if (selectedItems[0]) {
            label = selectedItems[0].label;
            if (selectedItems.length > 1) {
                extra = `+${selectedItems.length - 1}`;
            }
        }

        findElement(this.$targetLabel, '.label').innerText = label;
        findElement(this.$targetLabel, '.extra').innerText = extra;
    }

    private getItemsInGroup(groupLabel: MultiSelectItemGroup['groupLabel']): MultiSelectItemSingle[] {
        return this.items
            .filter((item): item is MultiSelectItemSingle => !isItemGroup(item))
            .filter(item => item.group === groupLabel);
    }

    private replaceItemsUI(): void {
        this.$itemContainer.innerHTML = '';
        const $itemTmpl = parseTemplate(itemTmpl);
        this.items.forEach((item, i) => {
            const $item = $itemTmpl.cloneNode(true) as typeof $itemTmpl;

            $item.setAttribute('data-item-id', item.id);
            if (isItemGroup(item)) {
                $item.classList.add('group');
            } else if (item.group) {
                $item.classList.add('has-group');
            }

            this.updateItemUI(item, $item);

            $item.addEventListener('click', (e) => {
                e.preventDefault();

                let isSelected: boolean;

                if (isItemGroup(item)) {
                    // select/unselect all items in group based on the current state of all items in the group:
                    // - if all items are selected, unselect all
                    // - otherwise, select all items

                    const groupItems = this.getItemsInGroup(item.id);
                    isSelected = !groupItems.every(item => item.selected);
                    groupItems.forEach((item) => {
                        item.selected = isSelected;
                        this.updateSelectedStateUI(item);
                    });
                } else {
                    item.selected = !item.selected;
                    isSelected = item.selected;

                    if (item.group) {
                        const groupItem = this.items.find(x => isItemGroup(x) && x.id === item.group);
                        if (groupItem) {
                            this.updateSelectedStateUI(groupItem);
                        }
                    }
                }

                this.logger.info((isSelected ? 'selected' : 'unselected') + ` item ${i} ` +
                    `"${isItemGroup(item) ? item.groupLabel + '[group]' : item.label}" (${item.id})`);

                this.updateSelectedStateUI(item, $item);
                this.updateTargetLabel();

                if (isSelected) {
                    this.emit('select', item);
                } else {
                    this.emit('unselect', item);
                }
            });

            this.$itemContainer.appendChild($item);
        });
    }

    private updateItemUI(item: MultiSelectItem, $item: HTMLElement): void {
        const $label = findElement($item, '.multiselect-item-label');
        $label.innerText = isItemGroup(item) ? item.groupLabel : item.label;
        this.updateSelectedStateUI(item, $item);
    }

    private updateSelectedStateUI(item: MultiSelectItem, $item?: HTMLElement): void {
        $item = $item || this.findListItem(item);
        const isSelected = isItemGroup(item) ? this.getItemsInGroup(item.id).every(item => item.selected) : item.selected;
        $item.classList.toggle('selected', isSelected);
    }

    private findListItem(item: MultiSelectItem): HTMLElement {
        const cls = isItemGroup(item) ? '.group' : '';
        return findElement(this.$itemContainer, `${cls}[data-item-id="${item.id}"]`);
    }

    public refresh(): void {
        this.items.forEach((item) => {
            this.updateItemUI(item, this.findListItem(item));
        });
    }

    public setItems(items: MultiSelectItem[]): void {
        this.items = items;
        this.replaceItemsUI();
        this.updateTargetLabel();
    }

    public show(): void {
        this.popover.show(this.$container);
    }

    public hide(): void {
        this.popover.hide();
    }
}
