import { EventEmitter } from './EventEmitter.ts';
import type { SiblingInsertOrder } from './utils.ts';

export interface DraggableEvent {
    $item: Element;
    type: string;
}

export interface DraggableReorderEvent extends DraggableEvent {
    sibling: Element | null;
    order: SiblingInsertOrder | null;
}

export type GlobalEventsMap = {
    draggable_start: [ DraggableEvent ];
    draggable_reorder: [ DraggableReorderEvent ];
    draggable_end: [ DraggableEvent ];
};

export class GlobalEvents extends EventEmitter<GlobalEventsMap> {
    public static readonly instance: GlobalEvents = new GlobalEvents();

    private constructor() {
        super();
    }
}
