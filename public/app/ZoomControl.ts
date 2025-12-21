import type { EditorSettings } from './Editor.ts';
import { EventEmitter } from './EventEmitter.ts';
import { Logger } from './Logger.ts';
import { Popover } from './Popover.ts';
import { findElement, findInput, parseTemplate } from './utils-dom.ts';
import {
    getZoomIndex,
    isValidZoomLevel,
    zoomLevelIndexDefault,
    zoomLevelIndexMax,
    zoomLevelLabel
} from './utils-zoom.ts';

const tmpl = `
<label class="zoom-level-label">
    <i class="fa-solid fa-magnifying-glass"></i>
    <span class="zoom-level-value">1x</span>
</label>
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

interface ZoomControlOptions {
    $mount: HTMLElement;
    context: string;
    editorSettings: EditorSettings;
}

type ZoomControlEventMap = {
    zoom_level_change: [ number ];
};

export class ZoomControl extends EventEmitter<ZoomControlEventMap> {
    private readonly $mount: HTMLElement;
    private readonly $el: HTMLElement;
    private readonly $value: HTMLElement;
    private readonly editorSettings: EditorSettings;
    private readonly logger: Logger;
    private readonly context: string;

    public constructor(options: ZoomControlOptions) {
        super();

        this.$mount = options.$mount;
        this.$el = parseTemplate(tmpl);
        this.$value = findElement(this.$el, '.zoom-level-value');
        this.editorSettings = options.editorSettings;
        this.context = options.context;
        this.logger = Logger.from(this);
    }

    public get name(): string {
        return `ZoomControl(${this.context})`;
    }

    public init(): void {
        if (this.$el.parentNode === this.$mount) {
            return;
        }

        const $zoomFormContent = parseTemplate(zoomFormTmpl);

        const zoomPopover = new Popover({
            title: 'Set zoom level',
            content: $zoomFormContent,
        });
        const $zoomLabel = this.$el;
        const $zoomInput = findInput($zoomFormContent, 'input');
        $zoomFormContent.addEventListener('submit', e => e.preventDefault());

        zoomPopover.on('show', () => this.logger.debug('showing zoom level popover'));
        this.on('zoom_level_change', value => this.logger.info(`zoom level index changed to ${value}`));

        $zoomInput.addEventListener('input', () => this.emit('zoom_level_change', Number($zoomInput.value)));
        $zoomLabel.addEventListener('click', () => {
            const zoomIndex = isValidZoomLevel(this.editorSettings.zoomLevel) ?
                getZoomIndex(this.editorSettings.zoomLevel) :
                zoomLevelIndexDefault;
            $zoomInput.value = zoomIndex.toString();

            zoomPopover.show($zoomLabel);
            $zoomInput.focus();
        });

        this.$mount.append(this.$el);
        this.syncUI();
    }

    public syncUI(): void {
        this.logger.warn('syncing UI to zoom level', this.editorSettings.zoomLevel + 'x');
        this.$value.innerText = (
            isValidZoomLevel(this.editorSettings.zoomLevel) ?
                zoomLevelLabel[this.editorSettings.zoomLevel] :
                this.editorSettings.zoomLevel
        ) + 'x';

        // if the popover to set the zoom level is open, keep that in sync as well
        const $zoomInput = document.body.querySelector('input.zoom-level-input');
        if ($zoomInput instanceof HTMLInputElement) {
            const zoomIndex = isValidZoomLevel(this.editorSettings.zoomLevel) ?
                getZoomIndex(this.editorSettings.zoomLevel) :
                zoomLevelIndexDefault;
            $zoomInput.value = zoomIndex.toString();
        }
    }
}
