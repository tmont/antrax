import { Logger } from './Logger.ts';
import { Popover } from './Popover.ts';
import { findElement, parseTemplate } from './utils-dom.ts';

let $copyError: HTMLElement | null = null;
export const getCopyErrorTmpl = (): HTMLElement => {
    if (!$copyError) {
        $copyError = parseTemplate('<div><i class="fa-solid fa-exclamation-triangle"></i> Failed to copy :(</div>');
    }
    return $copyError.cloneNode(true) as typeof $copyError;
}

export const copyToClipboard = async (text: string, successMessage: string): Promise<void> => {
    const logger = new Logger({
        name: 'CopyHelper',
    });

    try {
        await navigator.clipboard.writeText(text);
        logger.info(`successfully wrote to clipboard`);
        const $tmpl = parseTemplate('<div><i class="fa-solid fa-check"></i> <span></span></div>');
        findElement($tmpl, 'span').innerText = successMessage;
        Popover.toast({
            type: 'success',
            content: $tmpl,
        });
    } catch (e) {
        logger.error(`failed to write to clipboard`, e);
        Popover.toast({
            type: 'danger',
            content: getCopyErrorTmpl(),
        });
    }
};
