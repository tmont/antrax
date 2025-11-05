export type EventListener = (...args: any[]) => void;

type EventArgMap = {
    [name: string]: any[];
};

export interface EventListenerContext {
    listener: EventListener;
    count: number;
}

export class EventEmitter<TEventMap extends EventArgMap> {
    protected events: Partial<Record<keyof TEventMap, EventListenerContext[]>> = {};

    public listeners(name: keyof TEventMap): EventListenerContext[] {
        if (!this.events[name]) {
            this.events[name] = [];
        }

        return this.events[name];
    }

    public on<K extends keyof TEventMap>(name: K, listener: (...args: TEventMap[K]) => void, count = Infinity): void {
        this.listeners(name).push({
            listener,
            count,
        });
    }

    public once<K extends keyof TEventMap>(name: K, listener: (...args: TEventMap[K]) => void): void {
        this.listeners(name).push({
            listener,
            count: 1,
        });
    }

    public bubble<K extends keyof TEventMap>(name: K, other: EventEmitter<Pick<TEventMap, K>>): void {
        this.on(name, (...args) => {
            other.emit(name, ...args);
        });
    }

    public off<K extends keyof TEventMap>(name?: K, listener?: (...args: TEventMap[K]) => void): void {
        if (!name) {
            this.events = {};
            return;
        }

        if (!this.events[name]) {
            return;
        }

        if (!listener) {
            this.events[name] = [];
        } else {
            const listeners = this.listeners(name);
            const index = listeners.findIndex(x => x.listener === listener);
            if (index !== -1) {
                listeners.splice(index, 1);
            }
        }
    }

    public emit<K extends keyof TEventMap>(name: K, ...args: TEventMap[K]): void {
        this.listeners(name).forEach((context) => {
            context.listener.apply(this, args);
            context.count--;
            if (context.count <= 0) {
                this.off(name, context.listener);
            }
        });
    }
}
