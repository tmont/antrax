import type { PixelCanvas } from './canvas/PixelCanvas.ts';
import {
    CodeGenerationDetailLevel,
    type CodeGenerationOptions,
    formatAssemblyNumber,
    hasAddressLabel
} from './utils.ts';

interface CodeGenerationResult {
    code: string;
    warnings: string[];
}

export class CodeGenerator {
    public static generate(canvases: PixelCanvas[], options: CodeGenerationOptions): CodeGenerationResult {
        const warnings: string[] = [];
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

        const maxBytesPerLine = 0x100;

        let firstLineExceededWidth: number | null = null;
        for (let row = numLines - 1; row >= 0; row--) {
            const coefficient = numLines - row - 1;
            const offset = addressOffset + (maxBytesPerLine * coefficient);
            const offsetFormatted = formatAssemblyNumber(offset, options.addressOffsetRadix);

            const address = addressLabel ? `${addressLabel}${offset !== 0 ? ' + ' + offsetFormatted : ''}` : offsetFormatted;

            const orgComment = options.commentLevel >= CodeGenerationDetailLevel.Some ? ` ; line ${row + 1}` : '';
            code.push(`${indent}ORG ${address}${orgComment}`);
            code.push('');

            let sumWidth = 0;
            canvasByteLines.forEach((data) => {
                const chunks = data.lines[row];
                if (!chunks) {
                    // this canvas does not have data for this row (this shouldn't happen if the
                    // padToHeight stuff works the way it's supposed to)
                    return;
                }

                // NOTE: this heavily assumes that one chunk = one byte
                sumWidth += chunks.length;

                if (row === data.lines.length - 1) {
                    // first appearance of this object, needs a label
                    code.push(`${data.canvas.asmLabel}${options.labelColon ? ':' : ''}`);
                } else if (options.commentLevel >= CodeGenerationDetailLevel.Some) {
                    code.push(`; ${data.canvas.asmLabel}`);
                }

                code.push(...chunks);
                code.push('');
            });

            if (sumWidth > maxBytesPerLine && !firstLineExceededWidth) {
                firstLineExceededWidth = row + 1;
                warnings.push(`byte width of line ${firstLineExceededWidth} exceeds ${maxBytesPerLine} (${sumWidth})`);
            }
        }

        return {
            code: code.join('\n'),
            warnings,
        };
    }
}
