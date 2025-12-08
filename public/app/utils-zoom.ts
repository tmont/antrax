import { chars, type ValueOf } from './utils.ts';

export const zoomLevels = {
    0: 0.125,
    1: 0.25,
    2: 0.5,
    3: 1,
    4: 2,
    5: 3,
    6: 4,
    7: 5,
    8: 6,
    9: 7,
    10: 8,
} as const;

export type ZoomLevels = typeof zoomLevels;
export type ZoomLevel = ValueOf<ZoomLevels>;
export type ZoomLevelIndex = keyof ZoomLevels;
export const zoomLevelIndexMax = Math.max(...Object.keys(zoomLevels).map(Number)) as ZoomLevelIndex;

const zoomLevelsArr = Object.values(zoomLevels) as ZoomLevel[];
export const isValidZoomLevel = (value: number): value is ZoomLevel => {
    return zoomLevelsArr.indexOf(value as any) !== -1;
};

export const isValidZoomLevelIndex = (value: number): value is ZoomLevelIndex => {
    return typeof zoomLevels[value as ZoomLevelIndex] === 'number';
};

export const getZoomIndex = (zoomLevel: ZoomLevel): ZoomLevelIndex => {
    return zoomLevelsArr.indexOf(zoomLevel) as any;
};

const defaultZoomLevel: ZoomLevel = 1;
export const zoomLevelIndexDefault = getZoomIndex(defaultZoomLevel);

export const zoomLevelLabel: Record<ZoomLevel, string> = {
    '0.125': chars.oneEighth,
    '0.25': chars.oneFourth,
    '0.5': chars.oneHalf,
    '1': '1',
    '2': '2',
    '3': '3',
    '4': '4',
    '5': '5',
    '6': '6',
    '7': '7',
    '8': '8',
};
