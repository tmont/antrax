import { nope } from './utils';

export class Logger {
    public constructor(public readonly name: string) {
    }

    public static from(instance: object): Logger {
        return new Logger(instance.constructor.name);
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
                console[level](`[${this.name}]`, ...objects);
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
