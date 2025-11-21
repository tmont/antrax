import { EventEmitter } from './EventEmitter.ts';
import { findElement, findOrDie, nope, parseTemplate } from './utils.ts';

export interface ModalActionObjectBase {
    id: string;
    type: 'danger' | 'success' | 'primary' | 'secondary';
    align: 'start' | 'end';
}

export interface ModalActionObjectHtml extends ModalActionObjectBase {
    labelHtml: string;
}

export interface ModalActionObjectText extends ModalActionObjectBase {
    labelText: string;
}

export type ModalActionObject = ModalActionObjectHtml | ModalActionObjectText;

export type ModalAction = 'ok' | 'cancel' | ModalActionObject;

// noinspection SuspiciousTypeOfGuard
const isModalActionHtml = (action: ModalActionObject): action is ModalActionObjectHtml =>
    typeof (action as ModalActionObjectHtml).labelHtml === 'string';

interface ModalOptionsBase {
    title: string;
    actions?: 'ok' | 'ok/cancel' | ModalAction[];
    type?: 'danger' | 'success' | 'default';
}

export interface ModalOptionsText extends ModalOptionsBase {
    contentText: string;
}

export interface ModalOptionsHtml extends ModalOptionsBase {
    contentHtml: Node;
}

export type ModalOptions = ModalOptionsText | ModalOptionsHtml;

const tmpl = `
<div class="modal">
    <div class="modal-title"></div>
    <div class="modal-body"></div>
    <div class="modal-footer">
        <div class="actions-start actions-container"></div>
        <div class="actions-end actions-container"></div>
    </div>
</div>
`;

type ModalEventMap = {
    action: [ ModalActionObject ];
    close: [];
};

const hasHtmlContent = (options: ModalOptions): options is ModalOptionsHtml =>
    (options as ModalOptionsHtml).contentHtml instanceof Node;

export class Modal extends EventEmitter<ModalEventMap> {
    public static current: Modal | null = null;
    private static $overlay: HTMLElement | null = null;

    private readonly $el: HTMLElement;
    private isConnected = false;

    public static create(options: ModalOptions): Modal {
        if (!Modal.$overlay) {
            Modal.$overlay = findElement(document.body, '.modal-overlay');
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

        const $title = findElement(this.$el, '.modal-title');
        const $body = findElement(this.$el, '.modal-body');
        const $footer = findElement(this.$el, '.modal-footer');

        $title.innerText = options.title;

        const okAction: ModalActionObject = { id: '$ok', labelText: 'OK', type: 'primary', align: 'end' };
        const cancelAction: ModalActionObject = { id: '$cancel', labelText: 'Cancel', type: 'secondary', align: 'start' };

        const actions = !options.actions || options.actions === 'ok' ?
            [ okAction ]:
            (options.actions === 'ok/cancel' ? [ cancelAction, okAction ] : options.actions);

        const $startActions = findElement($footer, '.actions-start');
        const $endActions = findElement($footer, '.actions-end');

        actions.forEach((action) => {
            if (action === 'cancel') {
                action = cancelAction;
            } else if (action === 'ok') {
                action = okAction;
            }

            const $btn = document.createElement('button');
            $btn.type = 'button';
            $btn.classList.add('btn', `btn-${action.type}`);

            if (isModalActionHtml(action)) {
                $btn.innerHTML = action.labelHtml;
            } else {
                $btn.innerText = action.labelText;
            }
            $btn.addEventListener('click', () => {
                if (action.id === '$cancel') {
                    this.destroy();
                }

                this.emit('action', action);
            });

            switch (action.align) {
                case 'start':
                    $startActions.appendChild($btn);
                    break;
                case 'end':
                    $endActions.appendChild($btn);
                    break;
                default:
                    nope(action.align);
                    $endActions.appendChild($btn);
                    break;
            }
        });

        if (hasHtmlContent(options)) {
            $body.appendChild(options.contentHtml);
        } else {
            $body.innerText = options.contentText;
        }
    }

    public static isActive(): boolean {
        return !!Modal.current;
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

        const onKeyDown = (e: KeyboardEvent): void => {
            if (e.key === 'Escape') {
                this.destroy();
            }
        };

        document.addEventListener('keydown', onKeyDown);

        this.once('close', () => {
            document.removeEventListener('keydown', onKeyDown);
        });
    }

    public hide(): void {
        this.$el.style.display = 'none';
        if (Modal.$overlay) {
            Modal.$overlay.style.display = 'none';
        }
        this.emit('close');
    }

    public destroy(): void {
        this.hide();
        this.$el.remove();
        Modal.current = null;
    }
}
