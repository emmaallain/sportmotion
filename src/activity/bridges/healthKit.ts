import type { HealthKitBridge } from '../HealthKitProvider';

/** Apple Health only exists on iOS: everywhere else there is no bridge. */
export function createHealthKitBridge(): HealthKitBridge | null {
  return null;
}
