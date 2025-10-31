import { EventEmitter } from './EventEmitter.ts';
import { findElement, parseTemplate } from './utils.ts';

export type PopoverEventMap = {
    hide: [];
};

const tmpl = `
<div class="popover">
    <div class="popover-header">
        <span class="popover-title"></span>
        <span class="close-x"><i class="fa-solid fa-close"></i></span>
    </div>
    <div class="popover-content"></div>
</div>
`;

export interface PopoverOptions {
    title: string;
    content: HTMLElement;
}

export class Popover extends EventEmitter<PopoverEventMap> {
    private readonly $el: HTMLElement;

    public constructor(options: PopoverOptions) {
        super();

        this.$el = parseTemplate(tmpl);

        findElement(this.$el, '.popover-title').innerText = options.title;
        findElement(this.$el, '.popover-content').appendChild(options.content);

        findElement(this.$el, '.close-x').addEventListener('click', () => {
            this.hide();
        });
    }

    public hide(): void {
        this.$el.remove();
        this.emit('hide');
    }

    public show($target: HTMLElement): void {
        const position = $target.getBoundingClientRect();
        this.$el.style.left = position.left + 'px';
        this.$el.style.top = (position.top + position.height) + 'px';

        const parent = document.body;
        if (this.$el.parentNode !== parent) {
            parent.appendChild(this.$el);

            const onKeyDown = (e: KeyboardEvent) => {
                if (e.key === 'Escape') {
                    this.hide();
                }
            };

            const onMouseDown = (e: Event) => {
                if (!(e.target instanceof Node)) {
                    return;
                }

                if (!this.$el.contains(e.target)) {
                    this.hide();
                }
            };

            document.addEventListener('keydown', onKeyDown);

            // needs to be in event loop or else initial click hides it immediately, which seems
            // semi-impossible, but whatever.
            window.requestAnimationFrame(() => {
                document.addEventListener('mousedown', onMouseDown);
            });

            this.on('hide', () => {
                document.removeEventListener('keydown', onKeyDown);
                document.removeEventListener('mousedown', onMouseDown);
            });
        }
    }
}
