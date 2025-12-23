import { EventEmitter } from './EventEmitter.ts';
import { Logger } from './Logger.ts';
import { Modal } from './Modal.ts';
import { findButton, findElement, findTemplateContent } from './utils-dom.ts';

export type HelpSection =
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
    'ui'
    ;

const sectionMap: Record<HelpSection, 1> = {
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
}

type HelpModalEventMap = {
    shortcut_link: [];
};

export class HelpModal extends EventEmitter<HelpModalEventMap> {
    public static instance: HelpModal = new HelpModal();

    private readonly modal: Modal;
    private readonly logger: Logger;
    private readonly $content: HTMLElement;
    private readonly $back: HTMLButtonElement;
    private readonly $forward: HTMLButtonElement;
    private history: HistoryItem[] = [];
    private historyPosition = 0;

    protected constructor() {
        super();

        this.logger = Logger.from(this);

        const $tmpl = findTemplateContent(document, '#help-content').cloneNode(true) as DocumentFragment;
        const $content = findElement($tmpl, `.${idPrefix}container`);

        this.$back = findButton($content, '.btn-back');
        this.$forward = findButton($content, '.btn-forward');

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

    public static show(sectionName?: HelpSection, subsection?: string): HelpModal {
        this.instance.show(sectionName, subsection);
        return this.instance;
    }

    public navigateTo(sectionName: HelpSection, subsection?: string, appendToHistory = true): void {
        this.logger.debug('navigating to ' + sectionName + (subsection ? ' > ' + subsection : ''));
        const sectionId = `${idPrefix}${sectionName}`;
        const selector = `.help-content #${sectionId}`;
        const $activeSection = findElement(this.$content, selector);

        this.$content.querySelectorAll('.help-section').forEach(($section) => {
            const isActive = $section === $activeSection;
            $section.classList.toggle('active', isActive);

            if (isActive) {
                if (appendToHistory) {
                    if (this.historyPosition !== this.history.length - 1) {
                        this.history = this.history.slice(0, this.historyPosition);
                    }

                    // don't push consecutive identical history items
                    const last = this.history[this.history.length - 1];
                    if (!last || last.section !== sectionName || last.subsection !== subsection) {
                        this.history.push({
                            section: sectionName,
                            subsection,
                        });
                    }

                    this.historyPosition = this.history.length - 1;
                }

                if (subsection) {
                    const $subsection = findElement($section, `#${sectionId}_${subsection}`);
                    $subsection.scrollIntoView({
                        behavior: 'instant',
                    });
                } else {
                    $section.closest('.help-content')?.scrollTo(0, 0);
                }
            }
        });

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
        const { section, subsection } = this.history[this.historyPosition - 1] || {};
        if (!section) {
            return;
        }

        this.navigateTo(section, subsection, false);
        this.historyPosition--;
        this.syncNavUI();
    }

    public goForward(): void {
        const { section, subsection } = this.history[this.historyPosition + 1] || {};
        if (!section) {
            return;
        }

        this.navigateTo(section, subsection, false);
        this.historyPosition++;
        this.syncNavUI();
    }

    public static hide(): void {
        this.instance?.hide();
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
