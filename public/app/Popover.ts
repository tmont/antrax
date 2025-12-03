import { EventEmitter } from './EventEmitter.ts';
import { findElement, nope, parseTemplate } from './utils.ts';

export type PopoverEventMap = {
    show: [];
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

    private static readonly showingInstanceStack: Popover[] = [];

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

    public show($target?: Element | null): void {
        const parent = this.isToast ? findElement(document, '.toast-container') : document.body;
        if (this.$el.parentNode !== parent) {
            parent.appendChild(this.$el);

            if (!this.isToast) {
                const position = $target?.getBoundingClientRect() || { left: 0, top: 0, height: 0, width: 0 };

                // we do some confusing transforms to translateX the whole thing by some amount,
                // so that's why this isn't just "0"
                const leftThreshold = 30;

                const hangingOffBottomEdge =
                    position.top + position.height + this.$el.offsetHeight >= window.innerHeight - 50;
                const hangingOffRightEdge = position.left + this.$el.offsetWidth >= window.innerWidth - 50;
                const hangingOffLeftEdge = position.left <= leftThreshold;
                this.$el.classList.toggle('up', hangingOffBottomEdge);
                this.$el.classList.toggle('right', hangingOffRightEdge);

                this.$el.style.left = hangingOffRightEdge ?
                    (position.left + position.width - this.$el.offsetWidth) + 'px' :
                    (hangingOffLeftEdge ? leftThreshold : position.left) + 'px';
                this.$el.style.top = hangingOffBottomEdge ?
                    (position.top - this.$el.offsetHeight) + 'px' :
                    (position.top + position.height) + 'px';

                const $arrow = this.$el.querySelector('.arrow') as HTMLElement;
                if ($arrow) {
                    switch (this.arrowAlign) {
                        case 'center':
                            $arrow.style.left = hangingOffRightEdge ? 'auto' : (position.width / 2) + 'px';
                            $arrow.style.right = hangingOffRightEdge ? (position.width / 2) + 'px' : 'auto';
                            break;
                        case 'left':
                            $arrow.style.left = hangingOffRightEdge ? 'auto' : '1rem';
                            $arrow.style.right = hangingOffRightEdge ? '1rem' : 'auto';
                            break;
                        default:
                            nope(this.arrowAlign);
                            break;
                    }
                }
            } else {
                window.setTimeout(() => this.hide(), this.timeoutMs);
            }
        }

        this.on('hide', () => {
            const index = Popover.showingInstanceStack.indexOf(this);
            if (index !== -1) {
                Popover.showingInstanceStack.splice(index, 1);
            }
        });

        if (!this.isToast) {
            Popover.showingInstanceStack.push(this);
        }

        this.emit('show');
    }

    public static hideTopMost(): Popover | null {
        const popover = Popover.showingInstanceStack.pop() || null;
        popover?.hide();
        return popover;
    }

    public static topMostContains(target: Node): boolean {
        const topMost = Popover.showingInstanceStack[Popover.showingInstanceStack.length - 1];
        return !!topMost?.$el.contains(target);
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
