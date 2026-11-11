import { ManualActivityProvider } from './ManualActivityProvider';
import { MockActivityProvider } from './MockActivityProvider';

export * from './ActivityProvider';
export { MockActivityProvider } from './MockActivityProvider';
export { ManualActivityProvider, validateManualEntry } from './ManualActivityProvider';
export type { ManualEntry } from './ManualActivityProvider';

/** Providers active in the MVP: the simulator and manual entry. */
export const mockProvider = new MockActivityProvider();
export const manualProvider = new ManualActivityProvider();
