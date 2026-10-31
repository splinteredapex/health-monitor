import { dueReminders } from './reminders';
import { buildDefaultProgramme } from '../programme/template';
import { DEFAULT_REMINDERS } from '../db/repo';
import { protocolDay } from '../test/factories';
import type { RecordData } from './programme';

const prog = buildDefaultProgramme(0);
const empty: RecordData = { bp: [], weights: [], waists: [], exercise: [], sleep: [], nutrition: [], reviews: [] };
const input = (data: RecordData = empty) => ({ startDate: '2026-11-02', activities: prog.activities, completions: [], data, today: '2026-11-02' });

describe('reminders', () => {
  it('only when enabled, after the time, and while the task is open', () => {
    const at = (t: string) => new Date(`2026-11-02T${t}:00`);
    expect(dueReminders(DEFAULT_REMINDERS, input(), at('08:00'))).toEqual([]);
    const on = { ...DEFAULT_REMINDERS, enabled: true };
    expect(dueReminders(on, input(), at('07:00')).map((r) => r.kind)).toEqual(['weigh-in']);
    expect(dueReminders(on, input(), at('08:00')).map((r) => r.kind)).toContain('bp-am');
    expect(dueReminders(on, input({ ...empty, bp: protocolDay('2026-11-02', 130, 80, 2, 0) }), at('08:00')).map((r) => r.kind)).not.toContain('bp-am');
  });
});
