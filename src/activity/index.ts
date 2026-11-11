import { HealthConnectProvider } from './HealthConnectProvider';
import { HealthKitProvider } from './HealthKitProvider';
import { ManualActivityProvider } from './ManualActivityProvider';
import { MockActivityProvider } from './MockActivityProvider';

export * from './ActivityProvider';
export { MockActivityProvider } from './MockActivityProvider';
export { ManualActivityProvider, validateManualEntry } from './ManualActivityProvider';
export type { ManualEntry } from './ManualActivityProvider';

/** Providers active in the MVP: the simulator and manual entry. */
export const mockProvider = new MockActivityProvider();
export const manualProvider = new ManualActivityProvider();
export { HealthKitProvider } from './HealthKitProvider';
export type { HealthKitBridge } from './HealthKitProvider';
export { HealthConnectProvider } from './HealthConnectProvider';
export type { HealthConnectBridge } from './HealthConnectProvider';
export * from './healthMapping';
export { syncProvider } from './sync';

/** Skeletons: no native bridge is wired in the MVP, so both report "coming soon". */
export const healthKitProvider = new HealthKitProvider();
export const healthConnectProvider = new HealthConnectProvider();
