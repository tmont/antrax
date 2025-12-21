export type ShortcutCategory = 'Application' | 'Selection' | 'Draw mode' | 'Canvas';

export type ShortcutNameDrawMode =
    'Draw' | 'Erase' | 'Fill' | 'Dropper' |
    'RectFilled' | 'Rect' | 'EllipseFilled' | 'Ellipse' |
    'Line' | 'Pan' | 'Select' | 'Move';
export type ShortcutNameSelection = 'Copy' | 'Paste' | 'Delete';
export type ShortcutNameZoom = 'In' | 'Out' | 'Default';
export type ShortcutNameToggle = 'Grid' | 'Uncolored' | 'Kangaroo';
export type ShortcutNameExport = 'ASM' | 'Image' | 'Animation';
export type ShortcutName =
    'HidePopoverOrModal' |
    `DrawMode${ShortcutNameDrawMode}` |
    'NextColor' | 'PrevColor' |
    'Undo' | 'Redo' | 'Rotate' | 'SelectAll' | 'DeSelectAll' |
    `Selection${ShortcutNameSelection}` |
    `Zoom${ShortcutNameZoom}` |
    `Toggle${ShortcutNameToggle}` |
    `Export${ShortcutNameExport}` |
    'Help' | 'Shortcuts' | 'Changelog';

const nameMap: Record<ShortcutName, 1> = {
    Changelog: 1,
    DeSelectAll: 1,
    DrawModeDraw: 1,
    DrawModeDropper: 1,
    DrawModeEllipse: 1,
    DrawModeEllipseFilled: 1,
    DrawModeErase: 1,
    DrawModeFill: 1,
    DrawModeLine: 1,
    DrawModeMove: 1,
    DrawModePan: 1,
    DrawModeRect: 1,
    DrawModeRectFilled: 1,
    DrawModeSelect: 1,
    ExportAnimation: 1,
    ExportASM: 1,
    ExportImage: 1,
    Help: 1,
    HidePopoverOrModal: 1,
    NextColor: 1,
    PrevColor: 1,
    Redo: 1,
    Rotate: 1,
    SelectAll: 1,
    SelectionCopy: 1,
    SelectionDelete: 1,
    SelectionPaste: 1,
    Shortcuts: 1,
    ToggleGrid: 1,
    ToggleKangaroo: 1,
    ToggleUncolored: 1,
    Undo: 1,
    ZoomDefault: 1,
    ZoomIn: 1,
    ZoomOut: 1
};

export const isValidShortcutName = (name: string): name is ShortcutName => !!nameMap[name as ShortcutName];
