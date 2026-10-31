import Dexie from 'dexie';
import { db, DB_NAME, HealthDB, V1_STORES } from './db';
import { bpRepo, completeOnboarding, DEFAULT_REMINDERS, markDone, reschedule, saveBpSession, saveNutritionForDate, undoCompletion, ValidationError, saveProfile, sleepRepo } from './repo';
import { applyImport, exportBackup, parseBackup, previewImport, resetAllData } from './backup';
import { resolveSleep } from '../domain/sleep';

const START = '2026-11-02';
const profileInput = {
  sex: 'male' as const, heightCm: 178, baselineWeightKg: 80, baselineSystolic: 138, baselineDiastolic: 88,
  programmeStartDate: START, theme: 'system' as const, reminders: DEFAULT_REMINDERS, dateOfBirth: '1990-05-01',
};
const reading = (over = {}) => ({ takenAt: Date.UTC(2026, 10, 2, 7), tzOffsetMin: 0, localDate: START, localTime: '07:00', period: 'AM' as const, setting: 'home' as const, systolic: 138, diastolic: 88, contexts: [], ...over });

beforeEach(async () => {
  db.close();
  await Dexie.delete(DB_NAME);
  await db.open();
});

describe('repository', () => {
  it('onboarding seeds profile, goals and the full programme', async () => {
    await completeOnboarding(profileInput, {});
    expect(await db.userProfile.get('profile')).toMatchObject({ heightCm: 178 });
    expect(await db.programmeWeeks.count()).toBe(13);
    expect(await db.scheduledActivities.count()).toBeGreaterThan(200);
  });
  it('rejects invalid BP values', async () => {
    await expect(bpRepo.save(reading({ systolic: 80, diastolic: 90 }))).rejects.toBeInstanceOf(ValidationError);
    await expect(bpRepo.save(reading({ systolic: 400 }))).rejects.toBeInstanceOf(ValidationError);
    expect(await db.bloodPressure.count()).toBe(0);
  });
  it('BP create, edit and delete; edits keep createdAt', async () => {
    const r = await bpRepo.save(reading());
    expect(r.source).toBe('manual');
    const e = await bpRepo.save({ ...r, systolic: 132 });
    expect(e.createdAt).toBe(r.createdAt);
    expect((await db.bloodPressure.get(r.id))!.systolic).toBe(132);
    await bpRepo.remove(r.id);
    expect(await db.bloodPressure.count()).toBe(0);
  });
  it('saves a multi-reading session atomically', async () => {
    const rows = await saveBpSession([reading(), reading({ localTime: '07:01', systolic: 136 })]);
    expect(rows[0]!.sessionId).toBe(rows[1]!.sessionId);
    await expect(saveBpSession([reading(), reading({ systolic: 20 })])).rejects.toBeInstanceOf(ValidationError);
    expect(await db.bloodPressure.count()).toBe(2);
  });
  it('completion history: done → undo → reschedule', async () => {
    await markDone('a1', START);
    await undoCompletion('a1', START);
    await reschedule('a1', START, '2026-11-04');
    const c = (await db.activityCompletions.get(`a1@${START}`))!;
    expect(c.status).toBe('pending');
    expect(c.rescheduledTo).toBe('2026-11-04');
    expect(c.history.map((h) => h.action)).toEqual(['done', 'undone', 'rescheduled']);
  });
  it('nutrition is one record per date and keeps null distinct from zero', async () => {
    await saveNutritionForDate(START, { alcoholUnits: 0 });
    await saveNutritionForDate(START, { fruitVegPortions: 4 });
    const all = await db.nutrition.toArray();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ alcoholUnits: 0, fruitVegPortions: 4, caffeineMg: null });
  });
  it('changing programme start date preserves historic records', async () => {
    await completeOnboarding(profileInput, {});
    await markDone('x', START);
    await bpRepo.save(reading());
    await saveProfile({ programmeStartDate: '2026-11-09' });
    expect(await db.activityCompletions.count()).toBe(1);
    expect(await db.bloodPressure.count()).toBe(1);
  });
  it('sleep record across DST validates', async () => {
    const t = resolveSleep('2026-10-25', '23:30', '07:00');
    const s = await sleepRepo.save({ wakeDate: '2026-10-25', ...t, quality: 4 });
    expect(s.durationMin).toBe(8.5 * 60);
  });
});

describe('backup and restore', () => {
  beforeEach(async () => {
    await completeOnboarding(profileInput, {});
    await bpRepo.save(reading());
  });
  it('round-trips via JSON', async () => {
    const json = JSON.stringify(await exportBackup());
    await resetAllData();
    expect(await db.bloodPressure.count()).toBe(0);
    const parsed = parseBackup(json);
    if (!parsed.ok) throw new Error(parsed.errors.join());
    const preview = await previewImport(parsed.backup);
    expect(preview.totalConflicts).toBe(0);
    await applyImport(parsed.backup, 'replace');
    expect(await db.bloodPressure.count()).toBe(1);
    expect(await db.userProfile.get('profile')).toBeTruthy();
  });
  it('merge never overwrites and reports conflicts', async () => {
    const b = await exportBackup();
    const bpRow = b.tables.bloodPressure[0]!;
    await bpRepo.save({ ...(await db.bloodPressure.get(bpRow.id))!, systolic: 120 });
    b.tables.bloodPressure.push({ ...bpRow, id: 'new-one' });
    const parsed = parseBackup(JSON.stringify(b));
    if (!parsed.ok) throw new Error();
    const p = await previewImport(parsed.backup);
    const t = p.tables.find((x) => x.table === 'bloodPressure')!;
    expect(t).toMatchObject({ conflicts: 1, added: 1 });
    await applyImport(parsed.backup, 'merge');
    expect((await db.bloodPressure.get(bpRow.id))!.systolic).toBe(120);
    expect(await db.bloodPressure.count()).toBe(2);
  });
  it('rejects malformed, foreign, newer and invalid files', async () => {
    expect(parseBackup('not json').ok).toBe(false);
    expect(parseBackup('[]').ok).toBe(false);
    expect(parseBackup(JSON.stringify({ format: 'other' })).ok).toBe(false);
    const b = await exportBackup();
    expect(parseBackup(JSON.stringify({ ...b, formatVersion: 99 })).ok).toBe(false);
    const bad = structuredClone(b);
    (bad.tables.bloodPressure[0] as Record<string, unknown>).systolic = 'DROP TABLE';
    const r = parseBackup(JSON.stringify(bad));
    expect(r.ok).toBe(false);
    const dup = structuredClone(b);
    dup.tables.bloodPressure.push(dup.tables.bloodPressure[0]!);
    expect(parseBackup(JSON.stringify(dup)).ok).toBe(false);
  });
  it('strips unknown / prototype-polluting keys', async () => {
    const b = await exportBackup();
    const text = JSON.stringify(b).replace('"systolic":138', '"systolic":138,"__proto__":{"polluted":true},"evil":"<script>"');
    const r = parseBackup(text);
    if (!r.ok) throw new Error(r.errors.join());
    const row = r.backup.tables.bloodPressure[0]!;
    expect('evil' in row).toBe(false);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
  it('an interrupted import rolls back completely', async () => {
    const b = await exportBackup();
    const parsed = parseBackup(JSON.stringify(b));
    if (!parsed.ok) throw new Error();
    const spy = vi.spyOn(db.table('weeklyReviews'), 'bulkAdd').mockRejectedValueOnce(new Error('disk full'));
    await expect(applyImport(parsed.backup, 'replace')).rejects.toThrow();
    spy.mockRestore();
    expect(await db.bloodPressure.count()).toBe(1);
    expect(await db.userProfile.count()).toBe(1);
  });
});

describe('migrations', () => {
  it('v1 → v2 adds source to existing records without losing data', async () => {
    db.close();
    await Dexie.delete(DB_NAME);
    const v1 = new Dexie(DB_NAME);
    v1.version(1).stores(V1_STORES);
    await v1.open();
    const { source: _s, ...legacy } = { ...reading(), id: 'legacy', createdAt: 1, updatedAt: 1, source: 'x' };
    await v1.table('bloodPressure').add(legacy);
    v1.close();
    const v2 = new HealthDB();
    await v2.open();
    expect(v2.verno).toBe(2);
    expect(await v2.bloodPressure.get('legacy')).toMatchObject({ source: 'manual', systolic: 138 });
    expect(await v2.dailyMetrics.count()).toBe(0);
    v2.close();
  });
  it('a failing upgrade leaves the old data intact', async () => {
    db.close();
    await Dexie.delete(DB_NAME);
    const v1 = new Dexie(DB_NAME);
    v1.version(1).stores(V1_STORES);
    await v1.open();
    await v1.table('weights').add({ id: 'w', weightKg: 86 });
    v1.close();
    const broken = new Dexie(DB_NAME);
    broken.version(1).stores(V1_STORES);
    broken.version(2).stores({ dailyMetrics: 'id' }).upgrade(() => { throw new Error('boom'); });
    await expect(broken.open()).rejects.toThrow();
    broken.close();
    const check = new Dexie(DB_NAME);
    await check.open();
    expect(check.verno).toBe(1);
    expect(await check.table('weights').get('w')).toBeTruthy();
    check.close();
  });
});
