import { type CanvasOptions, PixelCanvas } from './editor.ts';

const editorCanvasEl = document.getElementById('editor');

if (!(editorCanvasEl instanceof HTMLCanvasElement)) {
    throw new Error('Unable to find <canvas> element with id "editor"');
}

const loResPixelWidth = 12;
const loResPixelHeight = 7;
const hiResPixelHeight = loResPixelHeight;
const hiResPixelWidth = loResPixelWidth / 2;

const options: CanvasOptions = {
    canvasEl: editorCanvasEl,
    editable: true,
    width: 30,
    height: 30,
    pixelHeight: loResPixelHeight,
    pixelWidth: loResPixelWidth,
    zoomLevel: 3,
    showGrid: false,
    pixelData: [
        [ { color: 'red', }, { color: 'blue' }, { color: 'green' } ],
        [ { color: 'black', }, { color: 'yellow' }, { color: 'magenta' } ],
        [ { color: 'orange', }, { color: 'purple' }, { color: 'cyan' } ],
    ],
};
const editorCanvas = new PixelCanvas(options);

editorCanvas.render();

document.querySelectorAll('.options-form input').forEach((el) => {
    const input = el as HTMLInputElement;
    input.addEventListener('change', () => {
        switch (input.id) {
            case 'option-show-grid':
                editorCanvas.setShowGrid(input.checked);
                break;
            case 'option-zoom-level':
                editorCanvas.setZoomLevel(Number(input.value));
                break;
            case 'option-width':
                editorCanvas.setDimensions(Number(input.value), null);
                break;
            case 'option-height':
                editorCanvas.setDimensions(null, Number(input.value));
                break;
            case 'option-pixel-width':
                editorCanvas.setPixelDimensions(Number(input.value), null);
                break;
            case 'option-pixel-height':
                editorCanvas.setPixelDimensions(null, Number(input.value));
                break;
        }
    });

    switch (input.id) {
        case 'option-show-grid':
            input.checked = !!options.showGrid;
            break;
        case 'option-zoom-level':
            input.value = String(options.zoomLevel || 2);
            break;
        case 'option-pixel-width':
            input.value = String(options.pixelWidth || 1);
            break;
        case 'option-pixel-height':
            input.value = String(options.pixelHeight || 1);
            break;
        case 'option-width':
            input.value = String(options.width || 10);
            break;
        case 'option-height':
            input.value = String(options.height || 10);
            break;
    }
});

// window.editorCanvas = editorCanvas;

