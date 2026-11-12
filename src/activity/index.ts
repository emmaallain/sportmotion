import { createHealthConnectBridge } from './bridges/healthConnect';
import { createHealthKitBridge } from './bridges/healthKit';
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

/**
 * Health providers. The bridges exist only in a native build on the matching platform; in
 * Expo Go and on the web they are null and the providers report "coming soon".
 */
export const healthKitProvider = new HealthKitProvider(createHealthKitBridge());
export const healthConnectProvider = new HealthConnectProvider(createHealthConnectBridge());
