import { ColorPickerBase } from './ColorPickerBase.ts';
import {
    type ColorPaletteType,
    convertToIndexed,
    type HSVColor,
    hsvToRGB,
    type IndexedRGBColor,
    rgbToHSV,
    type RGBValues
} from './colors.ts';
import { findElement, findInput, parseTemplate } from './utils-dom.ts';
import { type ClientCoordinates, touchToCoordinates } from './utils-event.ts';
import { clamp } from './utils.ts';

const isValidRGB = (value: unknown): value is number => typeof value === 'number' && !isNaN(value) && value >= 0 && value <= 255;
const isValidHue = (value: unknown): value is number => typeof value === 'number' && !isNaN(value) && value >= 0 && value <= 359;
const isValidPercentage = (value: unknown): value is number => typeof value === 'number' && !isNaN(value) && value >= 0 && value <= 100;

const tmpl = `
<div class="color-picker-rgb">
    <div class="test"></div>
    <div class="picker-area">
        <div class="sat-val-picker"><div class="active-color"></div></div>
        <div class="hue-picker"><input type="range" min="0" max="359" step="1" value="180" /></div>
    </div>
    <form>
        <table class="compact borderless">
            <tr>
                <td>
                    <div>
                        <label for="color-picker-rgb-r">R:</label>
                        <input class="form-control" id="color-picker-rgb-r" type="number" min="0" step="1" max="255" />
                    </div>
                </td>
                <td>
                    <div>
                        <label for="color-picker-rgb-g">G:</label>
                        <input class="form-control" id="color-picker-rgb-g" type="number" min="0" step="1" max="255" />
                    </div>
                </td>
                <td>
                    <div>
                        <label for="color-picker-rgb-b">B:</label>
                        <input class="form-control" id="color-picker-rgb-b" type="number" min="0" step="1" max="255" />
                    </div>
                </td>
                <td>
                    <input class="form-control" id="color-picker-rgb-hex" type="text" />
                </td>
            </tr>
            <tr>
                <td>
                    <div>
                        <label for="color-picker-rgb-h">H:</label>
                        <input class="form-control" id="color-picker-rgb-h" type="number" min="0" step="1" max="359" />
                    </div>
                </td>
                <td>
                    <div>
                        <label for="color-picker-rgb-s">S:</label>
                        <input class="form-control" id="color-picker-rgb-s" type="number" min="0" step="1" max="100" />
                    </div>
                </td>
                <td>
                    <div>
                        <label for="color-picker-rgb-v">V:</label>
                        <input class="form-control" id="color-picker-rgb-v" type="number" min="0" step="1" max="100" />
                    </div>
                </td>
                <td>
                    <div class="color-swatch"></div>
                </td>
            </tr>
        </table>
    </form>
</div>
`;

const calculateSVForContainer = (x: number, y: number, $container: HTMLElement) => {
    const { width, height } = $container.getBoundingClientRect();

    const v = (height - y) / height;
    const sv = 1 - ((width - x) / width);

    return { s: sv, v };
};



export interface ColorPickerOptions {
    title?: string | null;
    activeColor?: IndexedRGBColor | null;
}

export class ColorPickerRGB extends ColorPickerBase implements EventListenerObject {
    private readonly $hueInput: HTMLInputElement;
    private readonly $gradient: HTMLElement;
    private readonly $active: HTMLElement;
    private readonly $test: HTMLElement;
    private timeoutId: number | null = null;
    private hsv: HSVColor | null = null;

    public get name(): string {
        return 'ColorPickerRGB';
    }

    public get type(): ColorPaletteType {
        return 'rgb';
    }

    public constructor(options?: ColorPickerOptions) {
        super({
            $content: parseTemplate(tmpl),
        });

        this.$gradient = findElement(this.$el, '.sat-val-picker');
        this.$hueInput = findInput(this.$el, '.hue-picker input[type="range"]');
        this.$active = findElement(this.$gradient, '.active-color');
        this.$test = findElement(this.$el, '.test');
        this.activeColor = options?.activeColor || null;

        this.$hueInput.addEventListener('input', () => {
            const h = Math.round(Number(this.$hueInput.value));
            this.hsv = {
                s: 0,
                v: 0,
                ...this.hsv,
                h,
            };

            if (this.activeColor) {
                this.setHSV(this.hsv);
                this.updateAll();
            } else {
                this.updateGradient();
            }
        });

        const $form = findElement(this.$el, 'form');
        $form.querySelectorAll('input').forEach(($input) => {
            const event = $input.id === 'color-picker-rgb-hex' ? 'change' : 'input';
            $input.addEventListener(event, () => this.handleInput($input));
        });
    }

    public handleEvent(e: Event) {
        const isMove = (e instanceof MouseEvent  && e.type === 'mousemove') ||
            (e instanceof TouchEvent && e.type === 'touchmove');
        if (isMove) {
            const coords = e instanceof MouseEvent ? e : touchToCoordinates(e);
            this.handleMouseMove(coords);
            return;
        }

        const isStart = (e.type === 'mousedown' || e.type === 'touchstart') &&
            e.target instanceof HTMLElement && e.target.closest('.sat-val-picker');

        if (isStart) {
            this.handleMouseDown();
            return;
        }

        if (e.type === 'mouseup' || e.type === 'touchend') {
            this.handleMouseUp();
            return;
        }
    }

    private handleMouseDown() {
        document.body.classList.add('no-user-select');
        document.addEventListener('mousemove', this);
        document.addEventListener('touchmove', this);
        document.addEventListener('touchend', this);
        document.addEventListener('mouseup', this);
    }

    private handleMouseMove(e: ClientCoordinates) {
        const rect = this.$gradient.getBoundingClientRect();
        const x = clamp(0, rect.width, Math.round(e.clientX - rect.left));
        const y = clamp(0, rect.height, Math.round(e.clientY - rect.top));
        const { s, v } = calculateSVForContainer(x, y, this.$gradient);
        const hue = Number(this.$hueInput.value);

        this.setHSV({
            h: hue,
            s,
            v,
        });
        this.updateFields(); // hue won't change, don't need to update gradient
    }

    private handleMouseUp(): void {
        document.body.classList.remove('no-user-select');
        document.removeEventListener('mousemove', this);
        document.removeEventListener('touchmove', this);
    }

    private handleInput($input: HTMLInputElement): void {
        const id = $input.id;
        const field = id.replace('color-picker-rgb-', '');

        switch (field) {
            case 'r':
            case 'g':
            case 'b': {
                const r = Number(findInput(this.$el, '#color-picker-rgb-r').value);
                const g = Number(findInput(this.$el, '#color-picker-rgb-g').value);
                const b = Number(findInput(this.$el, '#color-picker-rgb-b').value);

                if (!isValidRGB(r) || !isValidRGB(g) || !isValidRGB(b)) {
                    return;
                }

                this.setRGB({ r, g, b });
                this.updateAll();
                break;
            }
            case 'h':
            case 's':
            case 'v': {
                const h = Number(findInput(this.$el, '#color-picker-rgb-h').value);
                const s = Number(findInput(this.$el, '#color-picker-rgb-s').value);
                const v = Number(findInput(this.$el, '#color-picker-rgb-v').value);

                if (!isValidHue(h) || !isValidPercentage(s) || !isValidPercentage(v)) {
                    return;
                }

                this.setHSV({
                    h,
                    s: s / 100,
                    v: v / 100,
                });
                this.updateAll();

                break;
            }
            case 'hex': {
                this.$test.style.backgroundColor = $input.value;
                const computed = window.getComputedStyle(this.$test).getPropertyValue('background-color');
                const [ r, g, b ] = (/rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(computed) || [ '', '0', '0', '0' ])
                    .slice(1)
                    .map(x => parseInt(x, 10));

                if (isValidRGB(r) && isValidRGB(g) && isValidRGB(b)) {
                    this.setRGB({ r, g, b });
                    this.updateAll();
                }

                break;
            }
        }
    }

    public hide(): void {
        document.removeEventListener('mousemove', this);
        document.removeEventListener('touchmove', this);
        this.$gradient.removeEventListener('mousedown', this);
        this.$gradient.removeEventListener('touchstart', this);
        this.popover.hide();
    }

    public show($target: HTMLElement): void {
        super.show($target);
        this.$gradient.addEventListener('mousedown', this);
        this.$gradient.addEventListener('touchstart', this);
        this.updateAll();
    }

    public setHSV(hsv: HSVColor | null): void {
        this.hsv = hsv;
        const rgb = hsv ? hsvToRGB(hsv) : null;
        this.activeColor = rgb ? convertToIndexed(rgb) : null;
        if (this.activeColor) {
            this.debounceColorSelection();
        }
    }

    public setRGB(rgb: RGBValues | null): void {
        this.activeColor = rgb ? convertToIndexed(rgb) : null;
        this.hsv = rgb ? rgbToHSV(rgb) : null;
        if (this.activeColor) {
            this.debounceColorSelection();
        }
    }

    public setActiveColor(color?: IndexedRGBColor | null) {
        super.setActiveColor(color);
        this.setRGB(color || null);
    }

    private debounceColorSelection(): void {
        if (this.timeoutId) {
            window.clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }

        this.timeoutId = window.setTimeout(() => {
            if (this.activeColor) {
                this.emit('color_select', this.activeColor);
            }
        }, 50);
    }

    private updateFields(): void {
        const rgb = this.activeColor || {
            r: 0,
            g: 0,
            b: 0,
            hex: '#000000',
        };
        const hsv = this.hsv || {
            h: 0,
            s: 0,
            v: 0,
        };

        const h = Math.round(hsv.h) % 360;
        this.$hueInput.value = h.toString();

        findInput(this.$el, '#color-picker-rgb-h').value = h.toString();
        findInput(this.$el, '#color-picker-rgb-s').value = Math.round(hsv.s * 100).toString();
        findInput(this.$el, '#color-picker-rgb-v').value = Math.round(hsv.v * 100).toString();

        findInput(this.$el, '#color-picker-rgb-r').value = Math.round(rgb.r).toString();
        findInput(this.$el, '#color-picker-rgb-g').value = Math.round(rgb.g).toString();
        findInput(this.$el, '#color-picker-rgb-b').value = Math.round(rgb.b).toString();

        findInput(this.$el, '#color-picker-rgb-hex').value = rgb.hex;
        findElement(this.$el, '.color-swatch').style.backgroundColor = rgb.hex;

        if (this.activeColor) {
            this.$active.style.display = '';

            const { width, height } = this.$gradient.getBoundingClientRect();

            const { s, v  } = hsv;
            const x = s * width;
            const y = (1 - v) * height;
            const l = v * (1 - (s / 2));
            const size = 8; // TODO

            this.$active.style.left = (x - (size / 2)) + 'px';
            this.$active.style.top = (y - (size / 2)) + 'px';
            this.$active.classList.toggle('light', l <= 0.5);
        } else {
            this.$active.style.display = 'none';
        }
    }

    private updateGradient(): void {
        const hue = Number(this.$hueInput.value);

        const gradients = [
            [ 'to bottom', 'rgba(0, 0, 0, 0) 0%', 'black 100%' ],
            [ 'to right', 'transparent 0%', `hsl(${hue} 100 50) 100%` ],
        ];

        this.$gradient.style.backgroundImage = gradients
            .map(g => `linear-gradient(${g.join(', ')})`)
            .join(', ');
    }

    private updateAll() {
        this.updateFields();
        this.updateGradient();
    }
}
