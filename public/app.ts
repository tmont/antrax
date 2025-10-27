import { Editor } from './app/Editor.ts';
import { Project } from './app/Project.ts';

const canvasArea = document.querySelector('.canvas-area');

if (!(canvasArea instanceof HTMLElement)) {
    throw new Error('Unable to find canvas mount point');
}

const loResPixelWidth = 12;
const loResPixelHeight = 7;
const hiResPixelHeight = loResPixelHeight;
const hiResPixelWidth = loResPixelWidth / 2;

const projectMountEl = document.querySelector('.project-structure');
if (!(projectMountEl instanceof HTMLElement)) {
    throw new Error('Unable to find project structure mount point');
}

const defaultZoomLevel = 3;
const defaultPixelWidth = loResPixelWidth;
const defaultPixelHeight = loResPixelHeight;
const defaultShowGrid = false;

const project = new Project({
    name: 'My Project',
    canvasHeight: 30,
    canvasWidth: 30,
    mountEl: projectMountEl,
    canvasMountEl: canvasArea,
    pixelHeight: defaultPixelHeight,
    pixelWidth: defaultPixelWidth,
    showGrid: defaultShowGrid,
    zoomLevel: defaultZoomLevel,

});
project.init();

const editor = new Editor({
    project,
    showGrid: defaultShowGrid,
    zoomLevel: defaultZoomLevel,
    mountEl: document.body,
});

editor.init();


//
// document.querySelectorAll('.options-form input').forEach((el) => {
//     const input = el as HTMLInputElement;
//     input.addEventListener('change', () => {
//         switch (input.id) {
//             case 'option-show-grid':
//                 editorCanvas.setShowGrid(input.checked);
//                 break;
//             case 'option-zoom-level':
//                 editorCanvas.setZoomLevel(Number(input.value));
//                 break;
//             case 'option-width':
//                 editorCanvas.setDimensions(Number(input.value), null);
//                 break;
//             case 'option-height':
//                 editorCanvas.setDimensions(null, Number(input.value));
//                 break;
//             case 'option-pixel-width':
//                 editorCanvas.setPixelDimensions(Number(input.value), null);
//                 break;
//             case 'option-pixel-height':
//                 editorCanvas.setPixelDimensions(null, Number(input.value));
//                 break;
//         }
//     });
//
//     switch (input.id) {
//         case 'option-show-grid':
//             input.checked = !!options.showGrid;
//             break;
//         case 'option-zoom-level':
//             input.value = String(options.zoomLevel || 2);
//             break;
//         case 'option-pixel-width':
//             input.value = String(options.pixelWidth || 1);
//             break;
//         case 'option-pixel-height':
//             input.value = String(options.pixelHeight || 1);
//             break;
//         case 'option-width':
//             input.value = String(options.width || 10);
//             break;
//         case 'option-height':
//             input.value = String(options.height || 10);
//             break;
//     }
// });

// window.editorCanvas = editorCanvas;

