export type EventListener = (...args: any[]) => void;

export type EventArgMap = {
    [name: string]: any[];
};

export interface EventListenerContext {
    listener: EventListener;
    count: number;
    namespace: string;
}

const allEvents = '*';

type StringKeyOf<T> = keyof T & string;
type EventNameWithNS<T extends EventArgMap, K extends StringKeyOf<T>> = `${K}.${string}`;
type EventName<T extends EventArgMap, K extends StringKeyOf<T>> = K | EventNameWithNS<T, K>;

// using "*" allows us to do stuff like .off('*.my_namespace') to turn off all events under a namespace
type EventNameOrAll<T extends EventArgMap, K extends StringKeyOf<T>> =
    EventName<T, K> |
    typeof allEvents |
    `${typeof allEvents}.${string}`;

const hasNamespace = <T extends EventArgMap, K extends StringKeyOf<T>>(
    name: EventName<T, K>,
): name is EventNameWithNS<T, K> => /.+\..+$/.test(name);

export class EventEmitter<TEventMap extends EventArgMap> {
    protected events: Partial<Record<keyof TEventMap, EventListenerContext[]>> = {};

    private parseEventName<K extends StringKeyOf<TEventMap>>(name: EventName<TEventMap, K>): { eventName: K; namespace: string; } {
        let eventName: K;
        let namespace = '*';
        if (hasNamespace(name)) {
            const parts = name.split('.');
            eventName = (parts[0] || '') as any;
            namespace = parts.slice(1).join('.');
        } else {
            eventName = name;
        }

        return {
            eventName,
            namespace,
        };
    }

    public listeners<K extends StringKeyOf<TEventMap>>(name: K): EventListenerContext[] {
        if (!this.events[name]) {
            this.events[name] = [];
        }

        return this.events[name];
    }

    public on<K extends StringKeyOf<TEventMap>>(
        name: EventName<TEventMap, K>,
        listener: (...args: TEventMap[K]) => void,
        count = Infinity,
    ): void {
        const { eventName, namespace } = this.parseEventName(name);
        this.listeners(eventName).push({
            listener,
            count,
            namespace,
        });
    }

    public once<K extends StringKeyOf<TEventMap>>(
        name: EventName<TEventMap, K>,
        listener: (...args: TEventMap[K]) => void,
    ): void {
        const { eventName, namespace } = this.parseEventName(name);
        this.listeners(eventName).push({
            listener,
            count: 1,
            namespace,
        });
    }

    public off<K extends StringKeyOf<TEventMap>>(
        name?: EventNameOrAll<TEventMap, K>,
        listener?: (...args: TEventMap[K]) => void,
    ): void {
        const { eventName, namespace } = name ? this.parseEventName(name as any) : { eventName: '*', namespace: '' };

        if (eventName === allEvents && !namespace) {
            // remove all listeners for all events
            this.events = {};
            return;
        }

        if (!this.events[eventName]) {
            // no registered listeners for this event, nothing to do
            return;
        }

        if (!listener) {
            if (eventName === allEvents) {
                // remove all listeners for this event
                this.events[eventName] = [];
            } else if (this.events[eventName]) {
                // remove listeners only for this namespace
                this.events[eventName] = this.events[eventName].filter(context => context.namespace !== namespace);
            }
        } else if (name) {
            const listeners = this.listeners(name);
            const index = listeners.findIndex(
                x => (!namespace || x.namespace === namespace) && x.listener === listener,
            );
            if (index !== -1) {
                listeners.splice(index, 1);
            }
        }
    }

    public emit<K extends StringKeyOf<TEventMap>>(name: K, ...args: TEventMap[K]): void {
        this.listeners(name).forEach((context) => {
            context.listener.apply(this, args);
            context.count--;
            if (context.count <= 0) {
                this.off(name, context.listener);
            }
        });
    }
}
