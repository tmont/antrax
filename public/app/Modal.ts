import { EventEmitter } from './EventEmitter.ts';
import { findOrDie, parseTemplate } from './utils.ts';

export interface ModalAction {
    id: string;
    label: string;
    type: 'danger' | 'success' | 'primary' | 'secondary';
    align: 'start' | 'end';
}

interface ModalOptionsBase {
    title: string;
    actions?: 'ok' | 'ok/cancel' | ModalAction[];
    type?: 'danger' | 'success' | 'default';
}

export interface ModalOptionsText extends ModalOptionsBase {
    contentText: string;
}

export interface ModalOptionsHtml extends ModalOptionsBase {
    contentHtml: string;
}

export type ModalOptions = ModalOptionsText | ModalOptionsHtml;

const tmpl = `
<div class="modal">
    <div class="modal-title"></div>
    <div class="modal-body"></div>
    <div class="modal-footer"></div>
</div>
`;

type ModalEventMap = {
    action: [ ModalAction ];
    close: [];
};

const hasHtmlContent = (options: ModalOptions): options is ModalOptionsHtml =>
    typeof (options as ModalOptionsHtml).contentHtml === 'string';

export class Modal extends EventEmitter<ModalEventMap> {
    public static current: Modal | null = null;
    private static $overlay: HTMLElement | null = null;

    private readonly $el: HTMLElement;
    private isConnected = false;

    public static create(options: ModalOptions): Modal {
        if (!Modal.$overlay) {
            Modal.$overlay = findOrDie(document.body, '.modal-overlay', node => node instanceof HTMLElement);
            Modal.$overlay.addEventListener('click', () => {
                Modal.current?.destroy();
                Modal.current?.emit('close');
            });
        }

        if (Modal.current) {
            Modal.current?.destroy();
            Modal.current = null;
        }

        const modal = new Modal(options);
        Modal.current = modal;
        return modal;
    }

    private constructor(options: ModalOptions) {
        super();
        this.$el = parseTemplate(tmpl);

        const $title = findOrDie(this.$el, '.modal-title', node => node instanceof HTMLElement);
        const $body = findOrDie(this.$el, '.modal-body', node => node instanceof HTMLElement);
        const $footer = findOrDie(this.$el, '.modal-footer', node => node instanceof HTMLElement);

        $title.innerText = options.title;

        const actions = !options.actions || options.actions === 'ok' ?
            [ { id: '$ok', label: 'OK', type: 'primary', align: 'end' } ] as ModalAction[]:
            (options.actions === 'ok/cancel' ?
                [
                    { id: '$cancel', label: 'Cancel', type: 'secondary', align: 'start' },
                    { id: '$ok', label: 'OK', type: 'primary', align: 'end' },
                ] as ModalAction[] :
                options.actions
            );

        actions.forEach((action) => {
            const $btn = document.createElement('button');
            $btn.type = 'button';
            $btn.classList.add('btn', `btn-${action.type}`);
            $btn.innerText = action.label;
            $btn.addEventListener('click', () => {
                if (action.id === '$cancel') {
                    this.destroy();
                }

                this.emit('action', action);
            });

            $footer.appendChild($btn);
        });

        if (hasHtmlContent(options)) {
            $body.innerHTML = options.contentHtml;
        } else {
            $body.innerText = options.contentText;
        }
    }

    public show(): void {
        if (!this.isConnected) {
            document.body.appendChild(this.$el);
        }

        this.isConnected = true;

        this.$el.style.display = 'block';
        if (Modal.$overlay) {
            Modal.$overlay.style.display = 'block';
        }
    }

    public hide(): void {
        this.$el.style.display = 'none';
        if (Modal.$overlay) {
            Modal.$overlay.style.display = 'none';
        }
    }

    public destroy(): void {
        this.hide();
        this.$el.remove();
    }
}
