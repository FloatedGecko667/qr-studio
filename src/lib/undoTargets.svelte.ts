import type { Mode } from './settings';
import type { Undoable } from './undo';

/**
 * Generators register here so the app bar can offer undo/redo for the current mode. The barcode
 * generators load on first use, so they register themselves rather than being imported.
 */
export const undoTargets: Partial<Record<Mode, Undoable>> = $state({});
