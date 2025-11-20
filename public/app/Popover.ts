import { EventEmitter } from './EventEmitter.ts';
import { findElement, nope, parseTemplate } from './utils.ts';

export type PopoverEventMap = {
    hide: [];
};

const tmpl = `
<div class="popover">
    <div class="arrow"></div>
    <div class="popover-header">
        <span class="popover-title"></span>
        <span class="close-x"><i class="fa-solid fa-close"></i></span>
    </div>
    <div class="popover-content"></div>
</div>
`;

type PopoverArrowAlignment = 'left' | 'center';

export interface PopoverOptions {
    title?: string;
    dropdown?: boolean;
    content: string | HTMLElement;
    arrow?: boolean;
    toast?: boolean;
    timeoutMs?: number;
    type?: 'default' | 'danger' | 'success';
    arrowAlign?: PopoverArrowAlignment;
}

export class Popover extends EventEmitter<PopoverEventMap> {
    private readonly $el: HTMLElement;
    private readonly isToast: boolean;
    private readonly timeoutMs: number;
    private readonly arrowAlign: PopoverArrowAlignment;

    public constructor(options: PopoverOptions) {
        super();

        this.$el = parseTemplate(tmpl);

        findElement(this.$el, '.close-x').addEventListener('click', () => {
            this.hide();
        });

        if (options.title) {
            findElement(this.$el, '.popover-title').innerText = options.title;
        } else {
            this.$el.classList.add('no-header');
        }

        this.isToast = options.toast === true;
        this.timeoutMs = options.timeoutMs || 5000;
        this.arrowAlign = options.arrowAlign || 'center';

        if (options.arrow === false || this.isToast) {
            findElement(this.$el, '.arrow').remove();
        }

        if (this.isToast) {
            this.$el.classList.add('toast');
        }

        if (options.dropdown) {
            this.$el.classList.add('dropdown');
        }

        const type = options.type || 'default';
        switch (type) {
            case 'default':
                break;
            case 'danger':
                this.$el.classList.add('danger');
                break;
            case 'success':
                this.$el.classList.add('success');
                break;
            default:
                nope(type);
                break;
        }

        const $content = findElement(this.$el, '.popover-content');
        if (options.content instanceof HTMLElement) {
            $content.appendChild(options.content);
        } else {
            $content.innerText = options.content;
        }
    }

    public setTitle(title: string | null) {
        findElement(this.$el, '.popover-title').innerText = title || '';
        if (title) {
            this.$el.classList.remove('no-header');
        } else {
            this.$el.classList.add('no-header');
        }
    }

    public hide(): void {
        this.$el.remove();
        this.emit('hide');
    }

    public show($target?: HTMLElement | null): void {
        const parent = this.isToast ? findElement(document, '.toast-container') : document.body;
        if (this.$el.parentNode !== parent) {
            parent.appendChild(this.$el);

            if (!this.isToast) {
                const position = $target?.getBoundingClientRect() || { left: 0, top: 0, height: 0, width: 0 };
                this.$el.style.left = position.left + 'px';
                this.$el.style.top = (position.top + position.height) + 'px';
                const $arrow = this.$el.querySelector('.arrow') as HTMLElement;
                if ($arrow) {
                    switch (this.arrowAlign) {
                        case 'center':
                            $arrow.style.left = (position.width / 2) + 'px';
                            break;
                        case 'left':
                            $arrow.style.left = '1rem';
                            break;
                        default:
                            nope(this.arrowAlign);
                            break;
                    }
                }

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
            } else {
                window.setTimeout(() => this.hide(), this.timeoutMs);
            }
        }
    }

    public static toast(options: Pick<PopoverOptions, 'title' | 'content' | 'type'>): Popover {
        const popover = new Popover({
            ...options,
            toast: true,
            arrow: false,
            dropdown: false,
        });

        popover.show();

        return popover;
    }
}
