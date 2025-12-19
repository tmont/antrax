import { EventEmitter } from './EventEmitter.ts';
import { Logger } from './Logger.ts';
import { chars } from './utils.ts';

type KeyAlpha =
    'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K' | 'L' | 'M' |
    'N' | 'O' | 'P' | 'Q' | 'R' | 'S' | 'T' | 'U' | 'V' | 'W' | 'X' | 'Y' | 'Z';
type KeyNumeric = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '0';
type KeyPunctuation =
    '`'  | '~' | '!' | '@' | '#' | '$' | '%' | '^' | '&'  | '*' | '(' | ')' |
    '-'  | '_' | '=' | '+' | '[' | '{' | ']' | '}' | '\\' | '|' | ':' | ';' |
    '\'' | '"' | ',' | '<' | '.' | '>' | '/' | '?';
type KeyModifier =
    'Shift' | 'Ctrl' | 'Alt' | 'Meta' |
    // mac-specific keys called out explicitly
    'Command' | 'Option';
type KeyFunction = 'F1' | 'F2' | 'F3' | 'F4' | 'F5' | 'F6' | 'F7' | 'F8' | 'F9' | 'F10' | 'F11' | 'F12';
type KeyNamed =
    'Escape' | 'Tab' | 'CapsLock' | 'Space' |
    'Backspace' | 'Enter' |
    'Insert' | 'Delete' | 'Home' | 'End' | 'PageUp' | 'PageDown' |
    'PrintScreen' | 'Pause' | 'Break' |
    'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown';

type KeyIgnoreShift = KeyAlpha | KeyNumeric | KeyPunctuation;

type Key = KeyAlpha | KeyNumeric | KeyPunctuation | KeyNamed | KeyFunction;

type KeyChord1 = `${KeyModifier}+${Key}`;
type KeyChord2 = `${KeyModifier}+${KeyModifier}+${Key}`;

type KeyAny = Key | KeyModifier;
export type KeyboardShortcut = KeyAny | KeyChord1 | KeyChord2;

const modifierOrderMap: Record<KeyModifier, number> = {
    Meta: 1,
    Ctrl: 2,
    Command: 3,
    Shift: 4,
    Alt: 5,
    Option: 6,
};

const namedKeyMap: Record<KeyNamed, 1> = {
    ArrowDown: 1,
    ArrowLeft: 1,
    ArrowRight: 1,
    ArrowUp: 1,
    Backspace: 1,
    Break: 1,
    CapsLock: 1,
    Delete: 1,
    End: 1,
    Enter: 1,
    Escape: 1,
    Home: 1,
    Insert: 1,
    PageDown: 1,
    PageUp: 1,
    Pause: 1,
    PrintScreen: 1,
    Space: 1,
    Tab: 1,
};

const alphaKeyMap: Record<KeyAlpha, 1> = {
    A: 1,
    B: 1,
    C: 1,
    D: 1,
    E: 1,
    F: 1,
    G: 1,
    H: 1,
    I: 1,
    J: 1,
    K: 1,
    L: 1,
    M: 1,
    N: 1,
    O: 1,
    P: 1,
    Q: 1,
    R: 1,
    S: 1,
    T: 1,
    U: 1,
    V: 1,
    W: 1,
    X: 1,
    Y: 1,
    Z: 1,
};

const numericKeyMap: Record<KeyNumeric, 1> = {
    '0': 1,
    '1': 1,
    '2': 1,
    '3': 1,
    '4': 1,
    '5': 1,
    '6': 1,
    '7': 1,
    '8': 1,
    '9': 1,
};

const fnKeyMap: Record<KeyFunction, 1> = {
    F1: 1, F10: 1, F11: 1, F12: 1, F2: 1, F3: 1, F4: 1, F5: 1, F6: 1, F7: 1, F8: 1, F9: 1
};

const allowedKeys: Record<KeyAny, number> = {
    ...fnKeyMap,
    ...namedKeyMap,
    ...modifierOrderMap,
    ...alphaKeyMap,
    ...numericKeyMap,
    '!': 1,
    '#': 1,
    '%': 1,
    '&': 1,
    '"': 1,
    ')': 1,
    '(': 1,
    '*': 1,
    '+': 1,
    ',': 1,
    '-': 1,
    '.': 1,
    '/': 1,
    ':': 1,
    ';': 1,
    '<': 1,
    '=': 1,
    '>': 1,
    '?': 1,
    '@': 1,
    '[': 1,
    '\'': 1,
    '\\': 1,
    ']': 1,
    '^': 1,
    '`': 1,
    '{': 1,
    '|': 1,
    '}': 1,
    '~': 1,
    $: 1,
    _: 1

};

type ShortcutPredicate = (e: KeyboardEvent) => boolean;
type ShortcutAction = ShortcutPredicate;

type ShortcutId = string;
export interface ShortcutInfo<TCat, TName> {
    id: ShortcutId;
    category: TCat;
    name: TName;
    description: string | null;
    group: number;
    keys: KeyAny[];
    action: ShortcutAction;
    predicates: ShortcutPredicate[];
    insertOrder: number;
}

const isValidKey = (key: string): key is KeyAny => !!allowedKeys[key as KeyAny];
const isModifier = (key: KeyAny): key is KeyModifier => !!modifierOrderMap[key as KeyModifier];
const isNamedKey = (key: KeyAny): key is KeyNamed => !!namedKeyMap[key as KeyNamed];
const isFunctionKey = (key: KeyAny): key is KeyFunction => !!fnKeyMap[key as KeyFunction];
const isAlphaKey = (key: KeyAny): key is KeyAlpha => !!alphaKeyMap[key as KeyAlpha];
const isNumericKey = (key: KeyAny): key is KeyNumeric => !!numericKeyMap[key as KeyNumeric];

// basically any key where pressing Shift does not change the output (ignoring case).
// essentially: punctuation
const isIgnoredShiftKey = (key: string): key is KeyIgnoreShift =>
    isValidKey(key) && !isNumericKey(key) && !isAlphaKey(key) && !isModifier(key) && !isNamedKey(key) && !isFunctionKey(key);

type KeyboardShortcutsEventMap<TCat, TName> = {
    match: [ { e: KeyboardEvent, shortcut: ShortcutInfo<TCat, TName> } ];
};

export interface ShortcutManagerOptions {
    /**
     * On Mac platforms, automatically convert Ctrl -> Meta and use
     * Command/Option text for getKeyText()
     */
    autoMac: boolean;
}

export class ShortcutManager<TCat extends string | null = null, TName extends string | null = null>
    extends EventEmitter<KeyboardShortcutsEventMap<TCat | null, TName | null>> {
    private readonly shortcuts = new Map<ShortcutId, ShortcutInfo<TCat | null, TName | null>[]>();
    private readonly shortcutsByName = new Map<string | null, ShortcutInfo<TCat | null, TName | null>[]>();
    private keyHandler: ((e: KeyboardEvent) => void) | null = null;
    private readonly logger: Logger;
    private groupCount = 0;
    private registerCount = 0;
    private readonly globalPredicates: ShortcutPredicate[] = [];
    private readonly autoMac: boolean;

    public constructor(options?: ShortcutManagerOptions) {
        super();

        this.autoMac = typeof options?.autoMac === 'boolean' ? options.autoMac : true;
        this.logger = Logger.from(this);
    }

    public get name(): string {
        return 'ShortcutManager';
    }

    public get useMacKeys(): boolean {
        return this.autoMac && /mac/i.test(navigator.platform);
    }

    public parseKeys(shortcut: KeyboardShortcut): KeyAny[] {
        const keys = [
            ...new Set(shortcut.split('+')
                .map(key => {
                    if (key === '') {
                        return '+';
                    }

                    if (this.useMacKeys) {
                        const ctrl: KeyAny = 'Ctrl';
                        const cmd: KeyAny = 'Meta';
                        if (key === ctrl) {
                            key = cmd;
                        }
                    }

                    return key;
                })
                .filter(isValidKey)),
        ];

        ShortcutManager.sortKeys(keys);

        return keys;
    }

    public registerBare(
        shortcut: KeyboardShortcut | KeyboardShortcut[],
        ...actions: ShortcutAction[]
    ): this {
        return this.register(null, null, null, shortcut, ...actions);
    }

    public registerGlobalPredicate(predicate: ShortcutPredicate): this {
        this.globalPredicates.push(predicate);
        return this;
    }

    public register(
        name: TName | null,
        category: TCat | null,
        description: ShortcutInfo<TCat, TName>['description'],
        shortcut: KeyboardShortcut | KeyboardShortcut[],
        ...actions: ShortcutAction[]
    ): this {
        const shortcuts = Array.isArray(shortcut) ? shortcut : [ shortcut ];
        actions = actions.concat([]);
        const action = actions.pop();
        const predicates = actions;

        if (!action) {
            throw new Error(`Must specify at least one action`);
        }

        this.groupCount++;

        shortcuts.forEach((shortcut) => {
            const keys = this.parseKeys(shortcut);
            const id = ShortcutManager.generateId(keys);
            let shortcuts = this.shortcuts.get(id);
            if (!shortcuts) {
                shortcuts = [];
                this.shortcuts.set(id, shortcuts);
            }

            let shortcutsByName = this.shortcutsByName.get(name);
            if (!shortcutsByName) {
                shortcutsByName = [];
                this.shortcutsByName.set(name, shortcutsByName);
            }

            const shortcutInfo: ShortcutInfo<TCat | null, TName | null> = {
                id,
                keys,
                group: this.groupCount,
                predicates,
                action,
                category,
                name,
                description,
                insertOrder: ++this.registerCount,
            };

            shortcuts.push(shortcutInfo);
            shortcutsByName.push(shortcutInfo);

            this.logger.debug(`registered ${id}: ${description}`);
        });

        return this;
    }

    private static sortKeys(keys: KeyAny[]): void {
        keys.sort((a, b) => {
            const aIsModifier = isModifier(a);
            const bIsModifier = isModifier(b);

            if (aIsModifier && bIsModifier) {
                return modifierOrderMap[a] - modifierOrderMap[b];
            }

            if (aIsModifier) {
                return -1;
            }

            if (bIsModifier) {
                return 1;
            }

            const aIsNamed = isNamedKey(a);
            const bIsNamed = isNamedKey(b);

            if (aIsNamed && bIsNamed) {
                return a.localeCompare(b);
            }

            if (aIsNamed) {
                return -1;
            }
            if (bIsNamed) {
                return 1;
            }

            const aIsFn = isFunctionKey(a);
            const bIsFn = isFunctionKey(b);

            if (aIsFn && bIsFn) {
                return a.localeCompare(b);
            }

            if (aIsFn) {
                return -1;
            }
            if (bIsFn) {
                return -1;
            }

            return a.localeCompare(b);
        });
    }

    private static generateId(keys: KeyAny[]): ShortcutId {
        this.sortKeys(keys);
        return keys.join('+');
    }

    public getMatches(e: KeyboardEvent): ShortcutInfo<TCat | null, TName | null>[] {
        const keys: KeyAny[] = [];

        let key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
        if (key === ' ') {
            // noinspection UnnecessaryLocalVariableJS
            const space: KeyNamed = 'Space';
            key = space;
        } else if (/^(Digit|Numpad)\d+/.test(e.code)) {
            // numbers are special, want to be able to match "Shift+0" without specifying "(", which
            // wouldn't match the numpad anyway ("Shift+Numpad0" = "Insert").
            key = e.code.replace(/\D/g, '');
        }

        if (isValidKey(key)) {
            keys.push(key);
        }

        if (e.ctrlKey) {
            keys.push('Ctrl');
        }
        if (e.altKey) {
            keys.push('Alt');
        }
        if (e.shiftKey && !isIgnoredShiftKey(key)) {
            keys.push('Shift');
        }
        if (e.metaKey) {
            keys.push('Meta');
        }

        const id = ShortcutManager.generateId(keys);

        return this.shortcuts.get(id) || [];
    }

    public enable(): void {
        if (this.keyHandler) {
            return;
        }

        this.logger.info('enabling');

        this.keyHandler = (e: KeyboardEvent) => {
            const shortcuts = this.getMatches(e);
            if (!shortcuts[0]) {
                return;
            }

            const id = shortcuts[0].id;
            this.logger.debug(`found shortcut match for ${id} (${shortcuts.length})`);

            if (!this.globalPredicates.every(predicate => predicate(e))) {
                this.logger.debug(`global predicate failed, not executing`);
                return;
            }

            for (const shortcut of shortcuts) {
                if (shortcut.predicates.length && !shortcut.predicates.every(predicate => predicate(e))) {
                    this.logger.debug(`predicate failed, not executing`);
                    continue;
                }

                this.emit('match', { e, shortcut });

                this.logger.info(`executing action "${shortcut.description || 'n/a'}" for ${id}`);
                if (!shortcut.action(e)) {
                    this.logger.debug(`action returned false, short-circuiting the action chain`);
                    break;
                }
            }
        };

        document.addEventListener('keydown', this.keyHandler);
    }

    public disable(): void {
        if (this.keyHandler) {
            this.logger.info('disabling');
            document.removeEventListener('keydown', this.keyHandler);
            this.keyHandler = null;
        }
    }

    public getShortcutsByName(name: string): ShortcutInfo<TCat | null, TName | null>[] {
        return this.shortcutsByName.get(name) || [];
    }

    public getShortcutsByCategory(): Map<TCat, Map<number, ShortcutInfo<TCat | null, TName | null>[]>> {
        const map = new Map<TCat, Map<number, ShortcutInfo<TCat | null, TName | null>[]>>();

        for (const shortcuts of this.shortcuts.values()) {
            for (const shortcut of shortcuts) {
                if (shortcut.category === null) {
                    continue;
                }

                let categorized = map.get(shortcut.category);
                if (!categorized) {
                    categorized = new Map();
                    map.set(shortcut.category, categorized);
                }

                let grouped = categorized.get(shortcut.group);
                if (!grouped) {
                    grouped = [];
                    categorized.set(shortcut.group, grouped);
                }
                grouped.push(shortcut);
            }
        }

        const entries = Array.from(map.entries());

        const getMin = (x: ShortcutInfo<any, any>[]): number => {
            return x.reduce((min, shortcut) => Math.min(min, shortcut.insertOrder), Infinity);
        };

        // sort categories by insertion order
        entries.sort((a, b) => {
            const aValue = a[1].values().reduce((min, shortcuts) => Math.min(min, getMin(shortcuts), Infinity), Infinity);
            const bValue = b[1].values().reduce((min, shortcuts) => Math.min(min, getMin(shortcuts), Infinity), Infinity);
            return aValue - bValue;
        });

        // sort each categories' shortcuts by minimum insertion order
        entries.forEach(([ category, groupedMap ], i) => {
            const groupedEntries = Array.from(groupedMap.entries());
            groupedEntries.sort((a, b) => getMin(a[1]) - getMin(b[1]));
            entries[i] = [ category, new Map(groupedEntries) ];
        });

        return new Map(entries);
    }

    public getKeyText(key: KeyAny): string {
        switch (key) {
            case 'Escape': return 'Esc';
            case 'ArrowDown': return chars.arrowDown;
            case 'ArrowUp': return chars.arrowUp;
            case 'ArrowLeft': return chars.arrowLeft;
            case 'ArrowRight': return chars.arrowRight;
            case 'Meta': return this.useMacKeys ? chars.command : chars.squarePlus;
            case 'Alt': return this.useMacKeys ? chars.option : key;
            default: return key;
        }
    }
}
