import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, attentionItems, completeTask, emptyWorkspace, fetchGitHubActivity, formatDue, migrateLegacy, nextEvent, planDay, rankedTasks, recurrenceNext, safeUrl, todayKey, validateWorkspace } from '../src/lib/workspace.js';
const now = new Date(2026, 8, 26, 10, 0);
const task = (id, extra = {}) => ({ id, title: id, priority: 'Medium', context: 'Personal', done: false, recurrence: 'none', deadline: null, scheduledDay: null, estimateMinutes: null, ...extra });
const event = (id, start, end, day = '2026-09-26') => ({ id, title: id, day, start, end });

test('today/tomorrow/overdue labels are correct throughout the local day', () => {
  for (const hour of [0, 10, 23]) {
    const date = new Date(2026, 8, 26, hour, 59);
    assert.equal(formatDue('2026-09-26', date), 'Today'); assert.equal(formatDue('2026-09-27', date), 'Tomorrow'); assert.equal(formatDue('2026-09-25', date), '1d overdue');
  }
  assert.equal(formatDue(null, now), 'No deadline'); assert.equal(addDays('2026-12-31', 1), '2027-01-01'); assert.equal(todayKey(new Date(2026, 8, 26, 0, 5)), '2026-09-26');
});
test('ranking puts overdue/today ahead of undated priorities and excludes completed tasks', () => {
  const tasks = [task('undated', { priority: 'High' }), task('tomorrow', { deadline: '2026-09-27' }), task('today', { deadline: '2026-09-26' }), task('overdue', { deadline: '2026-09-25' }), task('done', { done: true, deadline: '2026-09-20' })];
  assert.deepEqual(rankedTasks(tasks, now).map((t) => t.id), ['overdue', 'today', 'tomorrow', 'undated']); assert.equal(tasks[0].id, 'undated');
});
test('thoughts do not become urgent tasks; snoozing does not complete work', () => {
  const doc = emptyWorkspace(); doc.captures = [{ id: 'thought', kind: 'thought', text: 'Idea' }]; doc.tasks = [task('today', { deadline: '2026-09-26', snoozedUntil: new Date(2026, 8, 26, 11).toISOString() })];
  assert.deepEqual(attentionItems(doc, now), []); assert.equal(doc.tasks[0].done, false); assert.equal(attentionItems(doc, new Date(2026, 8, 26, 12))[0].targetId, 'today');
});
test('disconnected/dismissed alerts disappear while project blockers retain a reason', () => {
  const doc = emptyWorkspace(); doc.alerts = [{ id: 'old', title: 'Old', connectionId: 'missing', source: 'GitHub' }, { id: 'dismissed', title: 'Handled', dismissed: true }]; doc.projects = [{ id: 'project', name: 'Project', blocker: 'Approval' }];
  assert.deepEqual(attentionItems(doc, now).map((item) => item.kind), ['project']);
});
test('next event skips the past and includes current commitments', () => {
  assert.equal(nextEvent([event('past', '08:00', '09:00'), event('current', '09:45', '10:15'), event('next', '11:00', '12:00')], now).id, 'current'); assert.equal(nextEvent([], now), null);
});
test('planning merges overlapping buffered meetings and excludes elapsed time', () => {
  const doc = emptyWorkspace(); doc.events = [event('one', '10:30', '11:30'), event('two', '11:00', '12:00')]; const plan = planDay(doc, '2026-09-26', now);
  assert.deepEqual(plan.windows, [{ start: '10:00', end: '10:15', minutes: 15 }, { start: '12:15', end: '17:00', minutes: 285 }]); assert.equal(plan.capacityMinutes, 300);
});
test('planning handles outside-hours and full-day commitments', () => {
  const doc = emptyWorkspace(); doc.events = [event('outside', '06:00', '07:00')]; assert.equal(planDay(doc, '2026-09-26', now).capacityMinutes, 420); doc.events.push(event('all', '08:00', '18:00')); assert.deepEqual(planDay(doc, '2026-09-26', now).windows, []);
});
test('unknown estimates are explicit; overload is detected; done work consumes no capacity', () => {
  const doc = emptyWorkspace(); doc.tasks = [task('known', { scheduledDay: '2026-09-26', estimateMinutes: 500 }), task('unknown', { scheduledDay: '2026-09-26' }), task('done', { scheduledDay: '2026-09-26', estimateMinutes: 60, done: true })]; const plan = planDay(doc, '2026-09-26', now);
  assert.equal(plan.plannedMinutes, 500); assert.equal(plan.unknownEstimates, 1); assert.equal(plan.overloaded, true); assert.equal(plan.suggestion, null);
});
test('suggestions fit remaining capacity and exclude blocked projects', () => {
  const doc = emptyWorkspace(); doc.projects = [{ id: 'blocked', name: 'Blocked', blocker: 'Approval', milestones: [] }]; doc.tasks = [task('planned', { scheduledDay: '2026-09-26', estimateMinutes: 400 }), task('long', { estimateMinutes: 30 }), task('blocked', { projectId: 'blocked', estimateMinutes: 10 }), task('fits', { estimateMinutes: 15 })];
  assert.equal(planDay(doc, '2026-09-26', now).suggestion.id, 'fits'); assert.equal(planDay(doc, '2026-09-27', now).capacityMinutes, 480); assert.equal(planDay(doc, '2026-09-25', now).capacityMinutes, 0);
});
test('unknown planned durations prevent a false confident fit suggestion', () => {
  const doc = emptyWorkspace(); doc.tasks = [task('unknown', { scheduledDay: '2026-09-26' }), task('candidate', { estimateMinutes: 30 })];
  assert.equal(planDay(doc, '2026-09-26', now).suggestion, null);
});
test('monthly/yearly recurrence clamps dates and preserves month-end anchors', () => {
  assert.equal(recurrenceNext('2026-01-31', 'monthly'), '2026-02-28'); assert.equal(recurrenceNext('2026-02-28', 'monthly', '2026-01-31'), '2026-03-31'); assert.equal(recurrenceNext('2024-02-29', 'yearly'), '2025-02-28');
});
test('recurring completion creates one future occurrence even when reopened and completed again', () => {
  const doc = emptyWorkspace(); doc.tasks = [task('bill', { deadline: '2026-07-31', recurrence: 'monthly' })]; assert.ok(completeTask(doc, 'bill', now)); assert.equal(doc.tasks[1].deadline, '2026-09-30'); completeTask(doc, 'bill', now); assert.equal(doc.tasks[0].done, false); completeTask(doc, 'bill', now); assert.equal(doc.tasks.length, 2);
});
test('legacy migration preserves completion/progress/association and injects no fresh samples', () => {
  const legacy = { 'vk-projects': JSON.stringify([{ id: 1, name: 'Real', progress: 17 }]), 'vk-tasks': JSON.stringify([{ id: 2, title: 'Existing', project: 'Real', due: '2026-10-01', done: true }]) }; const doc = migrateLegacy({ getItem: (key) => legacy[key] || null });
  assert.equal(doc.tasks[0].projectId, '1'); assert.equal(doc.tasks[0].done, true); assert.equal(doc.tasks[0].deadline, '2026-10-01'); assert.equal(doc.projects[0].progress, 17); assert.equal(doc.events.length, 0); assert.equal(migrateLegacy({ getItem: () => null }).tasks.length, 0); assert.throws(() => migrateLegacy({ getItem: () => '{broken' }));
});
test('restore rejects invalid dates, versions, IDs, unsafe links, recurrence and time ranges', () => {
  assert.throws(() => validateWorkspace({ ...emptyWorkspace(), version: 99 })); assert.throws(() => validateWorkspace({ ...emptyWorkspace(), tasks: [task('x'), task('x')] })); assert.throws(() => validateWorkspace({ ...emptyWorkspace(), tasks: [task('x', { deadline: '2026-02-30' })] })); assert.throws(() => validateWorkspace({ ...emptyWorkspace(), tasks: [task('x', { sourceUrl: 'javascript:alert(1)' })] })); assert.throws(() => validateWorkspace({ ...emptyWorkspace(), events: [event('bad', '14:00', '13:00')] })); assert.throws(() => validateWorkspace({ ...emptyWorkspace(), tasks: [task('x', { recurrence: 'monthly' })] })); assert.equal(safeUrl('javascript:alert(1)'), ''); assert.equal(safeUrl('https://example.com'), 'https://example.com/');
});
test('GitHub maps open PRs/issues and closed IDs with stable dedupe identity', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => [{ number: 7, title: 'Review', state: 'open', html_url: 'https://github.com/a/repo/pull/7', pull_request: {}, labels: [], created_at: '2026-09-25T10:00:00Z', updated_at: '2026-09-26T10:00:00Z' }, { number: 8, state: 'closed' }] })); const result = await fetchGitHubActivity('a/repo');
  assert.equal(result.alerts[0].id, 'github:a/repo:7'); assert.match(result.alerts[0].reason, /Open pull request/); assert.deepEqual(result.resolvedIds, ['github:a/repo:8']); await assert.rejects(fetchGitHubActivity('../../bad'), /owner\/repo/);
});
test('GitHub private/inaccessible repositories receive an honest error', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 404 })); await assert.rejects(fetchGitHubActivity('a/repo'), /not found or private/);
});
