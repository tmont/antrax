import type { PixelCanvas } from './PixelCanvas.ts';
import {
    CodeGenerationDetailLevel,
    type CodeGenerationOptions,
    formatAssemblyNumber,
    hasAddressLabel
} from './utils.ts';

export class CodeGenerator {
    public static generate(canvases: PixelCanvas[], options: CodeGenerationOptions): string {
        const maxHeight = canvases.reduce((maxHeight, canvas) =>
            Math.max(maxHeight, canvas.getDimensions().height), 0);
        const canvasByteLines = canvases.map(canvas =>
            ({ canvas, lines: canvas.generateByteLineChunks({ ...options, padToHeight: maxHeight }) }));

        const indent = options.indentChar;

        let addressOffset = 0;
        let addressLabel = '';

        if (hasAddressLabel(options)) {
            addressLabel = options.addressLabel;
        } else {
            addressOffset = options.addressOffset || 0;
        }

        const numLines = canvasByteLines.reduce((max, data) => Math.max(max, data.lines.length), 0);

        const code: string[] = [];

        for (let row = numLines - 1; row >= 0; row--) {
            const coefficient = numLines - row - 1;
            const offset = addressOffset + (0x100 * coefficient);
            const offsetFormatted = formatAssemblyNumber(offset, options.addressOffsetRadix);

            const address = addressLabel ? `${addressLabel}${offset !== 0 ? ' + ' + offsetFormatted : ''}` : offsetFormatted;

            const orgComment = options.commentLevel >= CodeGenerationDetailLevel.Some ? ` ; line ${row + 1}` : '';
            code.push(`${indent}ORG ${address}${orgComment}`);
            code.push('');

            canvasByteLines.forEach((data) => {
                const chunks = data.lines[row];
                if (!chunks) {
                    // this canvas does not have data for this row (this shouldn't happen if the
                    // padToHeight stuff works the way it's supposed to)
                    return;
                }

                if (row === data.lines.length - 1) {
                    // first appearance of this object, needs a label
                    code.push(`${data.canvas.asmLabel}${options.labelColon ? ':' : ''}`);
                } else if (options.commentLevel >= CodeGenerationDetailLevel.Some) {
                    code.push(`; ${data.canvas.asmLabel}`);
                }

                code.push(...chunks);
                code.push('');
            });
        }

        return code.join('\n');
    }
}
