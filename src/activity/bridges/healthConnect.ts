import type { HealthConnectBridge } from '../HealthConnectProvider';

/** Health Connect only exists on Android: everywhere else there is no bridge. */
export function createHealthConnectBridge(): HealthConnectBridge | null {
  return null;
}
