import { Editor } from './app/Editor.ts';
import { Project } from './app/Project.ts';
import { findOrDie } from './app/utils.ts';

const canvasArea = findOrDie(document, '.canvas-area', node => node instanceof HTMLElement);
const projectMountEl = findOrDie(document, '.project-structure', node => node instanceof HTMLElement);

const loResPixelWidth = 12;
const loResPixelHeight = 7;
const hiResPixelHeight = loResPixelHeight;
const hiResPixelWidth = loResPixelWidth / 2;

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

