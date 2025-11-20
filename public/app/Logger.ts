import { nope } from './utils';

interface HasName {
    name: string;
}

interface HasNameGetter {
    getName(): string;
}

const hasName = (instance: any): instance is HasName =>
    !!instance &&
    typeof instance.name === 'string' &&
    !!instance.name;

export class Logger {
    public constructor(private readonly instance: HasName | HasNameGetter) {}

    public static from(instance: HasName | HasNameGetter): Logger {
        return new Logger(instance);
    }

    private log(level: 'debug' | 'info' | 'warn' | 'error', ...objects: any[]): void {
        if (!objects.length) {
            return;
        }

        switch (level) {
            case 'debug':
            case 'info':
            case 'warn':
            case 'error': {
                const name = hasName(this.instance) ? this.instance.name : this.instance.getName();
                console[level](`%c[${name}]`, `color: #666699`, ...objects);
                break;
            }
            default:
                nope(level);
                break;
        }
    }

    public debug(...messages: any[]): void {
        this.log('debug', ...messages);
    }

    public info(...messages: any[]): void {
        this.log('info', ...messages);
    }

    public warn(...messages: any[]): void {
        this.log('warn', ...messages);
    }

    public error(...messages: any[]): void {
        this.log('error', ...messages);
    }
}
