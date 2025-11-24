import { type DraggableReorderEvent, GlobalEvents } from './GlobalEvents.ts';
import { Logger } from './Logger.ts';

export interface DragState {
    type: string;
    item: Element;
}

const logger = new Logger({ name: 'Draggable' });
const activeItemClass = 'draggable-active-item';
const globalDraggingClass = 'draggable-dragging';

export const enableDraggableItems = (): void => {
    let dragState: DragState | null = null;

    const onDragging = (e: MouseEvent): void => {
        if (!dragState) {
            return;
        }

        const itemUnderCursor = document.elementFromPoint(e.clientX, e.clientY);
        const dropTarget = itemUnderCursor?.closest(`[data-drag-item="${dragState.type}"]`);
        const emptyDropTarget = itemUnderCursor?.closest(`[data-empty-drop-target="${dragState.type}"]`);
        if (!dropTarget && !emptyDropTarget) {
            return;
        }
        if (dropTarget === dragState.item) {
            return;
        }

        let dropped = false;
        let sibling: DraggableReorderEvent['sibling'] = null;
        let order: DraggableReorderEvent['order'] = null;
        if (dropTarget) {
            // const dropRect = dropTarget.getBoundingClientRect();
            // const itemRect = dragState.item.getBoundingClientRect();

            if (dropTarget.nextElementSibling !== dragState.item) {
                logger.debug(`inserting item after`, dropTarget);
                dropTarget.insertAdjacentElement('afterend', dragState.item);
                order = 'after';
                dropped = true;
            } else if (dropTarget.previousElementSibling !== dragState.item) {
                logger.debug(`inserting item before`, dropTarget);
                dropTarget.insertAdjacentElement('beforebegin', dragState.item);
                order = 'before';
                dropped = true;
            }

            if (dropped) {
                sibling = dropTarget;
            }
        } else if (emptyDropTarget && !emptyDropTarget.querySelector(`[data-drag-item="${dragState.type}"]`)) {
            // container is empty, we can drop it here
            emptyDropTarget.appendChild(dragState.item);
            dropped = true;
        }

        if (dropped) {
            logger.debug(`re-ordered item for "${dragState.type}"`);
            GlobalEvents.instance.emit('draggable_reorder', {
                $item: dragState.item,
                type: dragState.type,
                sibling,
                order,
            });
        }
    };

    const onDragEnd = (e: MouseEvent): void => {
        document.removeEventListener('mousemove', onDragging);
        document.removeEventListener('mouseup', onDragEnd);

        document.body.classList.remove(globalDraggingClass);

        if (dragState) {
            logger.debug(`drag ended for "${dragState.type}"`);
            GlobalEvents.instance.emit('draggable_end', { $item: dragState.item, type: dragState.type });
            dragState.item.classList.remove(activeItemClass);
            dragState = null;
        }
    };

    document.addEventListener('mousedown', (e) => {
        const handle = e.target;
        if (!(handle instanceof Element) || !handle.closest('[data-drag-handle]')) {
            return;
        }

        const draggable = handle.closest('[data-drag-item]');
        if (!draggable) {
            logger.error(`drag-handle does not have a parent [data-drag-item] element`, draggable);
            return;
        }

        const name = draggable.getAttribute('data-drag-item');
        if (!name) {
            logger.error(`draggable does not have attribute "data-drag-item"`, draggable);
            return;
        }

        e.preventDefault();
        e.stopImmediatePropagation();
        e.stopPropagation();

        logger.debug(`initiating drag for "${name}"`);

        dragState = {
            type: name,
            item: draggable,
        };

        GlobalEvents.instance.emit('draggable_start', { $item: dragState.item, type: dragState.type });

        document.body.classList.add(globalDraggingClass);
        draggable.classList.add(activeItemClass);

        document.addEventListener('mousemove', onDragging);
        document.addEventListener('mouseup', onDragEnd);
    });
};
