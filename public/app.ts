import { ColorPaletteSet } from './app/ColorPaletteSet.ts';
import { Editor } from './app/Editor.ts';
import { Project } from './app/Project.ts';
import { findElement } from './app/utils.ts';

const canvasArea = findElement(document, '.canvas-area');
const projectMountEl = findElement(document, '.project-structure');
const contentHeader = findElement(document, '.content-header');

const loResPixelWidth = 12;
const loResPixelHeight = 7;
const hiResPixelHeight = loResPixelHeight;
const hiResPixelWidth = loResPixelWidth / 2;

const defaultZoomLevel = 3;
const defaultPixelWidth = loResPixelWidth;
const defaultPixelHeight = loResPixelHeight;
const defaultShowGrid = false;

const colorPaletteSets: ColorPaletteSet[] = [];
for (let i = 0; i < 5; i++) {
    colorPaletteSets.push(new ColorPaletteSet({
        mountEl: contentHeader,
    }));
}

const defaultPaletteSet = colorPaletteSets[0]!;
const defaultPalette = defaultPaletteSet.getPalettes()[0];
if (!defaultPalette) {
    throw new Error(`could not find default color palette`);
}

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

    paletteSet: defaultPaletteSet,
    palette: defaultPalette,
    colorIndex: 0,
});

const editor = new Editor({
    project,
    showGrid: defaultShowGrid,
    zoomLevel: defaultZoomLevel,
    mountEl: document.body,
    paletteSets: colorPaletteSets,
});

editor.init();

