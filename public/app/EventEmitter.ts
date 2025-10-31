export type EventListener = (...args: any[]) => void;

type EventArgMap = {
    [name: string]: any[];
};

export class EventEmitter<TEventMap extends EventArgMap> {
    protected events: Partial<Record<keyof TEventMap, EventListener[]>> = {};

    public listeners(name: keyof TEventMap): EventListener[] {
        if (!this.events[name]) {
            this.events[name] = [];
        }

        return this.events[name];
    }

    public on<K extends keyof TEventMap>(name: K, listener: (...args: TEventMap[K]) => void): void {
        this.listeners(name).push(listener);
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
            const index = listeners.findIndex(x => x === listener);
            if (index !== -1) {
                listeners.splice(index, 1);
            }
        }
    }

    public emit<K extends keyof TEventMap>(name: K, ...args: TEventMap[K]): void {
        this.listeners(name).forEach((listener) => {
            listener.apply(this, args);
        });
    }
}
