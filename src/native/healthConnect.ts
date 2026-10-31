/**
 * Bridge to Android Health Connect (native Kotlin plugin, see android/…/HealthConnectPlugin.kt).
 * Samsung Health shares Galaxy Watch data into Health Connect; we read from there.
 * Only available inside the Android app – on the web every call reports 'unsupported'.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';

export const HC_TYPES = ['BloodPressure', 'Weight', 'SleepSession', 'ExerciseSession', 'RestingHeartRate', 'Steps', 'HeartRate'] as const;
export type HcType = (typeof HC_TYPES)[number];
export type HcStatus = 'available' | 'not_installed' | 'update_required' | 'unsupported';

export interface HcBloodPressure { id: string; time: string; zoneOffsetSeconds?: number | null; systolic: number; diastolic: number; origin?: string }
export interface HcWeight { id: string; time: string; zoneOffsetSeconds?: number | null; kg: number; origin?: string }
export interface HcSleep { id: string; startTime: string; endTime: string; startZoneOffsetSeconds?: number | null; endZoneOffsetSeconds?: number | null; deepMin?: number; remMin?: number; lightMin?: number; awakeMin?: number; origin?: string }
export interface HcExercise { id: string; startTime: string; endTime: string; startZoneOffsetSeconds?: number | null; category: string; title?: string | null; avgHr?: number | null; distanceM?: number | null; origin?: string }
export interface HcRestingHr { id: string; time: string; zoneOffsetSeconds?: number | null; bpm: number }
export interface HcSteps { date: string; steps: number }

interface HealthConnectPlugin {
  getStatus(): Promise<{ status: HcStatus }>;
  getGrantedPermissions(): Promise<{ granted: HcType[] }>;
  requestHealthPermissions(opts: { types: HcType[] }): Promise<{ granted: HcType[] }>;
  readRecords(opts: { type: HcType; startTime: string; endTime: string }): Promise<{ records: unknown[] }>;
  openHealthConnectSettings(): Promise<void>;
}

const Native = registerPlugin<HealthConnectPlugin>('HealthConnect');
export const isAndroidApp = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

export const HealthConnect = {
  async status(): Promise<HcStatus> {
    if (!isAndroidApp()) return 'unsupported';
    try { return (await Native.getStatus()).status; } catch { return 'unsupported'; }
  },
  granted: async () => (isAndroidApp() ? (await Native.getGrantedPermissions()).granted : []),
  request: async (types: HcType[]) => (await Native.requestHealthPermissions({ types })).granted,
  read: async (type: HcType, start: Date, end: Date) => (await Native.readRecords({ type, startTime: start.toISOString(), endTime: end.toISOString() })).records,
  openSettings: () => Native.openHealthConnectSettings(),
};
