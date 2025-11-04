import { ColorPaletteSet } from './app/ColorPaletteSet.ts';
import { Editor } from './app/Editor.ts';
import { findElement } from './app/utils.ts';

const contentHeader = findElement(document, '.content-header');

const colorPaletteSets: ColorPaletteSet[] = [];
for (let i = 0; i < 5; i++) {
    colorPaletteSets.push(new ColorPaletteSet({
        mountEl: contentHeader,
    }));
}

const editor = new Editor({
    mountEl: findElement(document, '.app'),
    paletteSets: colorPaletteSets,
});

editor.setProject(editor.createProject('My Project'));
editor.init();

