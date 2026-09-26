export const VERSION = 1;
export const uid = () => globalThis.crypto?.randomUUID?.() || `vk-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const todayKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const parseDay = (key) => new Date(`${key}T12:00:00`);
export function validDay(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parseDay(value).getTime()) && todayKey(parseDay(value)) === value;
}
export function addDays(key, count) { const date = parseDay(key); date.setDate(date.getDate() + count); return todayKey(date); }
const dayOrdinal = (key) => { const [y, m, d] = key.split('-').map(Number); return Date.UTC(y, m - 1, d) / 86400000; };
export function formatDue(key, date = new Date()) {
  if (!validDay(key)) return 'No deadline';
  const difference = dayOrdinal(key) - dayOrdinal(todayKey(date));
  if (difference === 0) return 'Today';
  if (difference === 1) return 'Tomorrow';
  if (difference < 0) return `${-difference}d overdue`;
  return new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short' }).format(parseDay(key));
}
export function safeUrl(value) {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; }
}
export const emptyWorkspace = () => ({ version: VERSION, tasks: [], captures: [], projects: [], events: [], alerts: [], connections: [], settings: { dayStart: '09:00', dayEnd: '17:00', bufferMinutes: 15 }, updatedAt: new Date().toISOString() });

function fail(message) { throw new Error(`Invalid backup: ${message}`); }
const clockValid = (value) => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const minutes = (value) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
const clock = (value) => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
export function validateWorkspace(value) {
  if (!value || value.version !== VERSION) fail('unsupported version.');
  const groups = ['tasks', 'captures', 'projects', 'events', 'alerts', 'connections'];
  for (const group of groups) {
    if (!Array.isArray(value[group]) || value[group].length > 10000) fail(`${group} must be a list of at most 10,000 records.`);
    const ids = new Set();
    for (const item of value[group]) {
      if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id || ids.has(item.id)) fail(`${group} has a missing or duplicate ID.`);
      ids.add(item.id);
      for (const field of ['notes', 'context', 'priority', 'status', 'nextAction', 'blocker', 'checkpoint', 'reason', 'source']) if (item[field] != null && typeof item[field] !== 'string') fail(`${group} has invalid ${field}.`);
      const text = item[group === 'captures' ? 'text' : group === 'projects' ? 'name' : group === 'connections' ? 'repository' : 'title'];
      if (typeof text !== 'string' || !text.trim() || text.length > 50000) fail(`${group} contains an empty or oversized record.`);
      for (const field of ['deadline', 'scheduledDay']) if (item[field] && !validDay(item[field])) fail(`${group} has an invalid date.`);
      if (group === 'tasks') {
        if (!['none', 'daily', 'weekly', 'monthly', 'yearly'].includes(item.recurrence || 'none')) fail('unknown recurrence.');
        if (item.recurrence && item.recurrence !== 'none' && !item.deadline) fail('recurring tasks need a deadline.');
        if (item.estimateMinutes != null && (!Number.isFinite(item.estimateMinutes) || item.estimateMinutes <= 0 || item.estimateMinutes > 1440)) fail('task estimate must be between 1 and 1440 minutes.');
      }
      if (group === 'captures' && !['thought', 'task', 'link', 'reminder'].includes(item.kind)) fail('unknown capture type.');
      if (group === 'projects' && (!Array.isArray(item.milestones) || item.milestones.some((m) => !m || typeof m.id !== 'string' || typeof m.title !== 'string' || !m.title.trim()))) fail('project milestones are invalid.');
      if (group === 'events' && (!validDay(item.day) || !clockValid(item.start) || !clockValid(item.end) || item.end <= item.start)) fail('commitment needs a valid day and an end after its start.');
      if (group === 'connections' && (item.provider !== 'github' || !validRepository(item.repository))) fail('GitHub repository must use owner/repo.');
      for (const field of ['sourceUrl', 'resourceUrl']) if (item[field] && !safeUrl(item[field])) fail('links must use http or https.');
    }
  }
  if (!value.settings || !clockValid(value.settings.dayStart) || !clockValid(value.settings.dayEnd) || value.settings.dayEnd <= value.settings.dayStart) fail('working hours must end after they start.');
  if (!Number.isInteger(value.settings.bufferMinutes) || value.settings.bufferMinutes < 0 || value.settings.bufferMinutes > 120) fail('meeting buffer must be 0–120 minutes.');
  return value;
}

export function migrateLegacy(storage) {
  const doc = emptyWorkspace();
  const read = (key) => { const raw = storage.getItem(key); if (!raw) return []; const result = JSON.parse(raw); if (!Array.isArray(result)) throw new Error(`Cannot migrate ${key}. Export or repair the original records before retrying.`); return result; };
  const projects = read('vk-projects');
  doc.projects = projects.map((item) => ({ ...item, id: String(item.id ?? uid()), name: item.name, status: item.status || 'Active', deadline: validDay(item.deadline) ? item.deadline : null, milestones: [], nextAction: '', blocker: '', checkpoint: '', resourceUrl: '', updatedAt: doc.updatedAt }));
  doc.tasks = read('vk-tasks').map((item) => ({ ...item, id: String(item.id ?? uid()), notes: item.notes || '', projectId: doc.projects.find((project) => project.name === item.project)?.id || null, context: 'Work', priority: item.priority || 'Medium', deadline: validDay(item.due) ? item.due : null, scheduledDay: null, estimateMinutes: null, recurrence: 'none', sourceUrl: '', createdAt: doc.updatedAt, updatedAt: doc.updatedAt, done: Boolean(item.done) }));
  return validateWorkspace(doc);
}

const priorityScore = (priority) => ({ High: 0, Medium: 1, Low: 2 }[priority] ?? 1);
export function rankedTasks(tasks, date = new Date()) {
  const today = todayKey(date);
  const band = (task) => task.deadline && task.deadline < today ? 0 : task.deadline === today ? 1 : task.scheduledDay === today ? 2 : task.deadline ? 3 : 4;
  return [...tasks].filter((task) => !task.done).sort((a, b) => band(a) - band(b) || (a.deadline || '9999').localeCompare(b.deadline || '9999') || priorityScore(a.priority) - priorityScore(b.priority) || (a.createdAt || '').localeCompare(b.createdAt || ''));
}
const isSnoozed = (item, date) => item.snoozedUntil && new Date(item.snoozedUntil).getTime() > date.getTime();
export function nextEvent(events, date = new Date()) {
  return [...events].filter((event) => new Date(`${event.day}T${event.end}:00`) > date).sort((a, b) => `${a.day}T${a.start}`.localeCompare(`${b.day}T${b.start}`))[0] || null;
}
export function attentionItems(data, date = new Date()) {
  const today = todayKey(date); const items = [];
  for (const task of rankedTasks(data.tasks, date)) {
    if (isSnoozed(task, date)) continue;
    let reason = '';
    if (task.deadline && task.deadline < today) reason = `${formatDue(task.deadline, date)} · decide what happens next`;
    else if (task.deadline === today) reason = 'Deadline today';
    else if (task.scheduledDay === today) reason = 'Planned for today';
    else if (task.priority === 'High' && task.deadline && task.deadline <= addDays(today, 7)) reason = `High priority · due ${formatDue(task.deadline, date)}`;
    if (reason) items.push({ id: `task:${task.id}`, kind: 'task', targetId: task.id, title: task.title, reason, source: task.sourceUrl ? 'Linked task' : task.context || 'VK', sourceUrl: task.sourceUrl, priority: task.deadline && task.deadline <= today ? 'High' : task.priority, createdAt: task.createdAt });
  }
  for (const alert of data.alerts) {
    if (alert.dismissed || isSnoozed(alert, date) || (alert.connectionId && !data.connections.some((c) => c.id === alert.connectionId))) continue;
    items.push({ ...alert, id: `alert:${alert.id}`, kind: 'alert', targetId: alert.id, source: alert.source || 'Manual' });
  }
  for (const event of data.events) {
    const start = new Date(`${event.day}T${event.start}:00`); const end = new Date(`${event.day}T${event.end}:00`);
    if (start - date <= 3600000 && end > date) items.push({ id: `event:${event.id}`, kind: 'event', targetId: event.id, title: event.title, reason: start > date ? `Starts at ${event.start}` : `In progress · ends ${event.end}`, source: 'VK calendar', sourceUrl: event.sourceUrl, priority: 'High', createdAt: event.createdAt });
  }
  for (const project of data.projects) if (project.blocker?.trim() && !isSnoozed(project, date)) items.push({ id: `project:${project.id}`, kind: 'project', targetId: project.id, title: project.name, reason: `Blocked · ${project.blocker}`, source: 'Project', sourceUrl: project.resourceUrl, priority: 'Medium', createdAt: project.updatedAt });
  return items.sort((a, b) => priorityScore(a.priority) - priorityScore(b.priority) || ({ event: 0, task: 1, project: 2, alert: 3 }[a.kind] - { event: 0, task: 1, project: 2, alert: 3 }[b.kind]) || (b.createdAt || '').localeCompare(a.createdAt || ''));
}

export function planDay(data, day = todayKey(), date = new Date()) {
  const events = data.events.filter((event) => event.day === day).sort((a, b) => a.start.localeCompare(b.start));
  const tasks = rankedTasks(data.tasks, date).filter((task) => task.scheduledDay === day);
  const dayStart = minutes(data.settings.dayStart); const dayEnd = minutes(data.settings.dayEnd);
  const nowMinute = date.getHours() * 60 + date.getMinutes();
  const start = day < todayKey(date) ? dayEnd : day === todayKey(date) ? Math.min(dayEnd, Math.max(dayStart, nowMinute)) : dayStart;
  const buffer = data.settings.bufferMinutes;
  const occupied = events.map((event) => [Math.max(start, minutes(event.start) - buffer), Math.min(dayEnd, minutes(event.end) + buffer)]).filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
  const windows = []; let cursor = start;
  for (const [a, b] of occupied) { if (a > cursor) windows.push({ start: clock(cursor), end: clock(a), minutes: a - cursor }); cursor = Math.max(cursor, b); }
  if (cursor < dayEnd) windows.push({ start: clock(cursor), end: clock(dayEnd), minutes: dayEnd - cursor });
  const capacityMinutes = windows.reduce((sum, w) => sum + w.minutes, 0);
  const plannedMinutes = tasks.reduce((sum, task) => sum + (task.estimateMinutes || 0), 0);
  const unknownEstimates = tasks.filter((task) => !task.estimateMinutes).length;
  const unscheduled = rankedTasks(data.tasks, date).filter((task) => !task.scheduledDay);
  const largestWindow = Math.max(0, ...windows.map((window) => window.minutes));
  // Scheduled work already consumes capacity. Never recommend more than remains.
  const suggestion = unknownEstimates ? null : unscheduled.find((task) => task.estimateMinutes && task.estimateMinutes <= Math.min(largestWindow, Math.max(0, capacityMinutes - plannedMinutes)) && !data.projects.find((p) => p.id === task.projectId)?.blocker?.trim()) || null;
  return { day, windows, events, tasks, capacityMinutes, plannedMinutes, unknownEstimates, remainingMinutes: capacityMinutes - plannedMinutes, overloaded: plannedMinutes > capacityMinutes, unscheduled, suggestion };
}

export function recurrenceNext(deadline, frequency, anchor = deadline) {
  if (!validDay(deadline)) return null;
  if (frequency === 'daily') return addDays(deadline, 1);
  if (frequency === 'weekly') return addDays(deadline, 7);
  if (!['monthly', 'yearly'].includes(frequency)) return null;
  const [year, month] = deadline.split('-').map(Number); const desiredDay = Number(anchor.split('-')[2]);
  const target = new Date(year, month - 1 + (frequency === 'yearly' ? 12 : 1), 1, 12);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(desiredDay, lastDay)); return todayKey(target);
}
export function completeTask(doc, taskId, date = new Date()) {
  const task = doc.tasks.find((item) => item.id === taskId); if (!task) return null;
  task.done = !task.done; task.updatedAt = date.toISOString();
  if (!task.done || !task.recurrence || task.recurrence === 'none' || !task.deadline) return null;
  const existing = doc.tasks.find((item) => item.recurrenceParentId === task.id);
  if (existing) return null;
  const anchor = task.recurrenceAnchor || task.deadline;
  let deadline = recurrenceNext(task.deadline, task.recurrence, anchor);
  while (deadline && deadline <= todayKey(date)) deadline = recurrenceNext(deadline, task.recurrence, anchor);
  const id = uid();
  doc.tasks.push({ ...task, id, done: false, deadline, scheduledDay: null, snoozedUntil: null, recurrenceAnchor: anchor, recurrenceParentId: task.id, createdAt: date.toISOString(), updatedAt: date.toISOString() });
  return id;
}

export const validRepository = (repo) => typeof repo === 'string' && /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38})\/[a-zA-Z0-9_.-]+$/.test(repo);
export async function fetchGitHubActivity(repository, signal) {
  if (!validRepository(repository)) throw new Error('Use a public repository in owner/repo format.');
  // Bounded latest activity, explicitly not an exhaustive repository inventory.
  const response = await fetch(`https://api.github.com/repos/${repository}/issues?state=all&sort=updated&direction=desc&per_page=50`, { signal, headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } });
  if (!response.ok) throw new Error(response.status === 404 ? 'Repository not found or private. Only public repositories are supported.' : response.status === 403 || response.status === 429 ? 'GitHub rate limit or access restriction. Try again later.' : `GitHub returned ${response.status}. Try again.`);
  const records = await response.json(); if (!Array.isArray(records)) throw new Error('GitHub returned an unexpected response.');
  const alerts = records.filter((item) => item.state === 'open').map((item) => ({ id: `github:${repository.toLowerCase()}:${item.number}`, title: item.title, reason: `${item.pull_request ? 'Open pull request' : 'Open issue'} #${item.number} · ${repository}`, source: 'GitHub', sourceUrl: safeUrl(item.html_url), priority: item.labels?.some((label) => /critical|urgent|bug/i.test(label.name)) ? 'High' : 'Low', createdAt: item.created_at, updatedAt: item.updated_at, dismissed: false, snoozedUntil: null }));
  return { alerts, fetchedAt: new Date().toISOString(), resolvedIds: records.filter((item) => item.state === 'closed').map((item) => `github:${repository.toLowerCase()}:${item.number}`) };
}
