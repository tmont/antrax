import type { ProjectStats } from './utils.ts';

export const lastEditorStateStorageKey = 'last_editor_state';

export interface EditorStateStats {
    savedAt: number;
    size: number;
    sizeBase64: number;
    projectName: string;
    stats: ProjectStats;
    image: string | null;
}
