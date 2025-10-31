import { nope } from './utils';

const hasName = (instance: object): instance is { name: string } => typeof (instance as any).name === 'string' &&
    (instance as any).name;

export class Logger {
    public constructor(public readonly name: string) {
    }

    public static from(instance: object): Logger {
        const name = hasName(instance) ? instance.name : instance.constructor.name;
        return new Logger(name);
    }

    private log(level: 'debug' | 'info' | 'warn' | 'error', ...objects: any[]): void {
        if (!objects.length) {
            return;
        }

        switch (level) {
            case 'debug':
            case 'info':
            case 'warn':
            case 'error':
                console[level](`%c[${this.name}]`, `color: #666699`, ...objects);
                break;
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
