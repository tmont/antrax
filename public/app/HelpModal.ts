import { EventEmitter } from './EventEmitter.ts';
import { Logger } from './Logger.ts';
import { Modal } from './Modal.ts';
import { Popover } from './Popover.ts';
import type { ShortcutManager } from './ShortcutManager.ts';
import { findButton, findElement, findTemplateContent, parseTemplate } from './utils-dom.ts';

const keywordContent = {
    'active color': 'The currently selected color, this can change from object to object',
    canvas: 'The rectangular region in the center of the screen on which you draw',
    'color swatch': parseTemplate('<div>Little square displaying a drawable color, e.g. ' +
        '<span class="color-swatch" style="background-color: rebeccapurple"></span></div>'),
    'draw mode': 'Dictates the behavior when interacting with the canvas: e.g. draw/erase/fill/pan/etc.',
    group: 'A named, ordered collection of objects visible in the main sidebar',
    object: 'A graphics object, most often this can be considered a "sprite", but can also refer to ' +
        'background or tile graphics',
    'overflow menu': parseTemplate(`<div>Dropdown menu identified by a button with an ellipsis: ` +
        `<button type="button" class="btn btn-xs btn-tertiary"><i class="fa-solid fa-ellipsis-h"></i></button></div>`),
    project: 'A collection of groups and objects which can be serialized to an external file',
    pixel: 'Refers to a pixel as represented in the object, ' +
        'its size dictated by the user-defined pixel dimensions',
    region: 'An outlined rectangle on the canvas that can be manipulated. ' +
        'Usually created by using the "select" draw mode.',
    'zoom level': 'The magnification multiple applied to the canvas',
} as const;

type HelpKeyword = keyof typeof keywordContent;

const isKeyword = (text: string): text is HelpKeyword => text in keywordContent;

export type HelpSection =
    'about' |
    'animation' |
    'canvas-interaction' |
    'debug' |
    'display-modes' |
    'draw-modes' |
    'editor-settings' |
    'export-asm' |
    'export-image' |
    'palettes' |
    'project-structure' |
    'save-and-load' |
    'selection-actions' |
    'ui';

const sectionMap: Record<HelpSection, 1> = {
    about: 1,
    "canvas-interaction": 1,
    "display-modes": 1,
    "draw-modes": 1,
    "editor-settings": 1,
    "export-asm": 1,
    "export-image": 1,
    "project-structure": 1,
    "save-and-load": 1,
    "selection-actions": 1,
    animation: 1,
    debug: 1,
    palettes: 1,
    ui: 1
};

const isValidSection = (name: unknown): name is HelpSection => !!sectionMap[name as HelpSection];
const idPrefix = 'help-content-';

interface HistoryItem {
    section: HelpSection;
    subsection?: string;
    scrollTop: number;
}

type HelpModalEventMap = {
    shortcut_link: [];
};

interface HelpModalOptions {
    shortcutManager: ShortcutManager<any, any>;
}

export class HelpModal extends EventEmitter<HelpModalEventMap> {
    private readonly modal: Modal;
    private readonly shortcutManager: ShortcutManager;
    private readonly logger: Logger;
    private readonly $content: HTMLElement;
    private readonly $back: HTMLButtonElement;
    private readonly $forward: HTMLButtonElement;
    private readonly $scrollContainer: HTMLElement;
    private history: HistoryItem[] = [];
    private historyPosition = 0;

    public constructor(options: HelpModalOptions) {
        super();

        this.shortcutManager = options.shortcutManager;
        this.logger = Logger.from(this);

        const $tmpl = findTemplateContent(document, '#help-content').cloneNode(true) as DocumentFragment;
        const $content = findElement($tmpl, `.${idPrefix}container`);

        this.$back = findButton($content, '.btn-back');
        this.$forward = findButton($content, '.btn-forward');
        this.$scrollContainer = findElement($content, '.help-content');

        this.$back.addEventListener('click', () => this.goBack());
        this.$forward.addEventListener('click', () => this.goForward());

        $content.querySelectorAll<HTMLAnchorElement>('a').forEach(($item) => {
            const hash = new URL($item.href).hash;
            if (!hash) {
                return;
            }

            const [ sectionName, subsectionName ] = hash.substring(`#${idPrefix}`.length).split('_');
            if (!isValidSection(sectionName)) {
                this.logger.error(`help link with invalid href "${$item.href}"`, {
                    sectionName,
                    subsectionName,
                });
                return;
            }

            $item.addEventListener('click', (e) => {
                e.preventDefault();
                this.navigateTo(sectionName, subsectionName);
            });
        });

        $content.querySelectorAll('.keyboard-link').forEach(($item) => {
            $item.addEventListener('click', (e) => {
                e.preventDefault();
                this.emit('shortcut_link');
            });
        });

        const keywordPopover = new Popover({ size: 'medium' });
        $content.querySelectorAll<HTMLSpanElement>('.help-keyword').forEach(($keyword) => {
            const text = $keyword.innerText.trim().toLowerCase().replace(/[^-a-z\s0-9]/g, '');
            const textNoS = text.replace(/s$/, '');
            let keyword: HelpKeyword;
            if (isKeyword(text)) {
                keyword = text;
            } else if (isKeyword(textNoS)) {
                keyword = textNoS;
            } else {
                this.logger.error(`unknown help keyword "${text}"`, $keyword);
                return;
            }

            $keyword.addEventListener('click', () => {
                keywordPopover.setContent(keywordContent[keyword]);
                keywordPopover.show($keyword);
            });
        });

        const shortcutPopover = new Popover({
            size: 'medium',
            arrowAlign: 'left',
        });
        const $shortcutTmpl = parseTemplate(`<div>shortcut: <ul class="kbd-command-list inline"></ul></div>`);
        $content.querySelectorAll<HTMLSpanElement>('[data-shortcut]').forEach(($el) => {
            const shortcutName = $el.getAttribute('data-shortcut');
            if (!shortcutName) {
                this.logger.error(`Invalid value in data-shortcut attribute`, $el);
                return;
            }

            const $content = $shortcutTmpl.cloneNode(true) as typeof $shortcutTmpl;
            const $cmdList = findElement($content, '.kbd-command-list');
            $el.addEventListener('click', () => {
                // this stuff must be resolved lazily since the shortcut manager might not be
                // configured yet
                const shortcuts = this.shortcutManager.getShortcutsByName(shortcutName);
                if (!shortcuts.length) {
                    this.logger.error(`No shortcuts found for "${shortcutName}"`, $el);
                    return;
                }

                $cmdList.innerHTML = '';
                shortcuts.forEach((shortcut) => {
                    const $li = document.createElement('li');
                    for (let i = 0; i < shortcut.keys.length; i++) {
                        const $kbd = document.createElement('kbd');
                        $kbd.innerText = this.shortcutManager.getKeyText(shortcut.keys[i]!);
                        $li.append($kbd);
                        if (i !== shortcut.keys.length - 1) {
                            $li.append(' + ');
                        }
                    }

                    $cmdList.append($li);
                });

                shortcutPopover.setContent($content);
                shortcutPopover.show($el);
            });
        });

        this.modal = Modal.create({
            title: 'Antrax Help',
            actions: 'close',
            contentHtml: $content,
        });

        this.$content = $content;
    }

    public get name(): string {
        return 'HelpModal';
    }

    public navigateTo(sectionName: HelpSection, subsection?: string, appendToHistory = true, scrollTop = 0): void {
        this.logger.debug('navigating to ' + sectionName + (subsection ? ' > ' + subsection : ''));
        const sectionId = `${idPrefix}${sectionName}`;
        const selector = `.help-content #${sectionId}`;
        const $activeSection = findElement(this.$content, selector);

        // must cache this because it might be affected when we activate sections
        const currentScrollTop = this.$scrollContainer.scrollTop;

        this.$content.querySelectorAll('.help-section').forEach(($section) => {
            const isActive = $section === $activeSection;

            $section.classList.toggle('active', isActive);

            if (isActive && appendToHistory) {
                if (this.historyPosition !== this.history.length - 1) {
                    this.logger.debug(`current navigation index is not at the end of the history stack, ` +
                        `slicing to 0..${this.historyPosition + 1}`);
                    this.history = this.history.slice(0, this.historyPosition + 1);
                }

                // don't push consecutive identical history items
                const last = this.history[this.history.length - 1];
                if (!last || last.section !== sectionName || last.subsection !== subsection) {
                    const current = this.history[this.historyPosition];
                    if (current) {
                        current.scrollTop = currentScrollTop;
                    }

                    this.history.push({
                        section: sectionName,
                        subsection,
                        scrollTop: 0,
                    });
                }

                while (this.history.length > 50) {
                    this.history.shift();
                }

                this.historyPosition = this.history.length - 1;
            }
        });

        if (subsection) {
            const $subsection = findElement($activeSection, `#${sectionId}_${subsection}`);
            $subsection.scrollIntoView({
                behavior: 'instant',
            });
        } else {
            this.$scrollContainer.scrollTo(0, scrollTop);
        }

        this.$content.querySelectorAll<HTMLAnchorElement>('.help-sidebar .help-item').forEach(($anchor) => {
            $anchor.classList.toggle('active', new URL($anchor.href).hash === '#' + sectionId);
        });

        this.syncNavUI();
    }

    private syncNavUI(): void {
        this.$back.disabled = this.historyPosition <= 0;
        this.$forward.disabled = this.historyPosition >= this.history.length - 1;
    }

    public goBack(): void {
        this.navigateToHistoryItem(-1);
    }

    public goForward(): void {
        this.navigateToHistoryItem(1);
    }

    private navigateToHistoryItem(dir = 1 | -1): void {
        const { section, subsection, scrollTop } = this.history[this.historyPosition + dir] || {};
        if (!section) {
            return;
        }

        this.navigateTo(section, subsection, false, scrollTop);
        this.historyPosition += dir;
        this.syncNavUI();
    }

    public show(sectionName?: HelpSection, subsection?: string): void {
        this.modal.show();

        sectionName = sectionName || 'canvas-interaction';
        this.navigateTo(sectionName, subsection);
    }

    public hide(): void {
        this.modal.destroy();
    }
}
