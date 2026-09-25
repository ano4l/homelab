import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  AlertTriangle, ArrowRight, Bell, Bitcoin, CalendarDays, Check, ChevronRight,
  CircleDollarSign, Clock3, Command, FolderKanban, Github, GripHorizontal, Maximize2,
  Menu, Plus, Radio, Server, Sparkles, Trophy, X
} from 'lucide-react';
import AnimatedSphere from './components/AnimatedSphere';
import OptionWheel from './components/OptionWheel';
import { checkSupabaseConnection, isSupabaseConfigured } from './lib/supabase';
import './styles.css';

const DAY = 86400000;
const dateKey = (date) => date.toISOString().slice(0, 10);
const shiftDate = (days) => dateKey(new Date(Date.now() + days * DAY));
const localDateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
function briefingCycleKey(date = new Date()) { const cycle = new Date(date); if (cycle.getHours() < 6) cycle.setDate(cycle.getDate() - 1); return localDateKey(cycle); }

const seedProjects = [
  { id: 1, name: 'VK Command Centre', progress: 68, status: 'Building', deadline: shiftDate(4) },
  { id: 2, name: 'Atlas routing prototype', progress: 42, status: 'Planning', deadline: shiftDate(12) },
  { id: 3, name: 'Forma workspace', progress: 86, status: 'Polishing', deadline: shiftDate(2) },
];

const seedTasks = [
  { id: 1, title: 'Connect Supabase project schema', project: 'VK Command Centre', priority: 'High', due: shiftDate(0), done: false },
  { id: 2, title: 'Review compact dashboard layout', project: 'VK Command Centre', priority: 'Medium', due: shiftDate(0), done: false },
  { id: 3, title: 'Ship route fixture to staging', project: 'Atlas routing prototype', priority: 'High', due: shiftDate(1), done: false },
  { id: 4, title: 'Confirm Forma release notes', project: 'Forma workspace', priority: 'Low', due: shiftDate(2), done: true },
];

const widgetDefaults = {
  projects: { x: 2, y: 6, w: 25, h: 37 },
  tasks: { x: 3, y: 56, w: 27, h: 38 },
  briefing: { x: 71, y: 6, w: 27, h: 37 },
  signals: { x: 77, y: 48, w: 21, h: 23 },
  schedule: { x: 69, y: 74, w: 29, h: 19 },
};
const nodeItems = [
  { label: 'Projects', icon: FolderKanban, area: 'projects', x: 18, y: 24 },
  { label: 'Tasks', icon: Check, area: 'tasks', x: 15, y: 68 },
  { label: 'Deadlines', icon: Clock3, area: 'tasks', x: 50, y: 88 },
  { label: 'Briefing', icon: Sparkles, area: 'briefing', x: 83, y: 24 },
  { label: 'Markets', icon: Bitcoin, area: 'signals', x: 86, y: 68 },
  { label: 'Calendar', icon: CalendarDays, area: 'schedule', x: 50, y: 8 },
];

function usePersistentState(key, fallback) {
  const [value, setValue] = useState(() => {
    try { const stored = localStorage.getItem(key); return stored ? JSON.parse(stored) : fallback; }
    catch { return fallback; }
  });
  useEffect(() => { localStorage.setItem(key, JSON.stringify(value)); }, [key, value]);
  return [value, setValue];
}

function App() {
  const [pinHash, setPinHash] = useState(() => localStorage.getItem('vk-pin-hash') || '');
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem('vk-unlocked') === 'true');
  const [projects, setProjects] = usePersistentState('vk-projects', seedProjects);
  const [tasks, setTasks] = usePersistentState('vk-tasks', seedTasks);
  const [widgets, setWidgets] = usePersistentState('vk-widget-layout', widgetDefaults);
  const [menuOpen, setMenuOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [briefingGate, setBriefingGate] = useState(() => localStorage.getItem('vk-last-briefing-cycle') !== briefingCycleKey());
  const [expandedWidget, setExpandedWidget] = useState(() => localStorage.getItem('vk-last-briefing-cycle') !== briefingCycleKey() ? 'briefing' : null);
  const [focusArea, setFocusArea] = useState('briefing');
  const [activity, setActivity] = useState('VK started monitoring your workspace.');
  const [now, setNow] = useState(new Date());
  const [cloudStatus, setCloudStatus] = useState(isSupabaseConfigured ? 'checking' : 'local');

  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (!isSupabaseConfigured) return undefined;
    let active = true;
    checkSupabaseConnection()
      .then(() => { if (active) setCloudStatus('connected'); })
      .catch(() => { if (active) setCloudStatus('unreachable'); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!unlocked) return;
    const cycle = briefingCycleKey(now);
    if (localStorage.getItem('vk-last-briefing-cycle') !== cycle) { setBriefingGate(true); setExpandedWidget('briefing'); }
  }, [now, unlocked]);
  useEffect(() => {
    if (localStorage.getItem('vk-widget-size-version') === '3') return;
    setWidgets((items) => Object.fromEntries(Object.entries(items).map(([id, box]) => {
      const heightBoost = { projects: 6, tasks: 7, briefing: 6, signals: 3, schedule: 3 }[id] || 0;
      const w = Math.min(31, box.w + (id === 'tasks' ? 2 : 0)); const h = Math.min(46, box.h + heightBoost);
      return [id, { ...box, x: Math.min(box.x, 98 - w), y: Math.min(box.y, 97 - h), w, h }];
    })));
    localStorage.setItem('vk-widget-size-version', '3');
  }, [setWidgets]);
  useEffect(() => {
    const close = (event) => { if (event.key === 'Escape') { setMenuOpen(false); setCaptureOpen(false); } };
    window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close);
  }, []);

  const system = useMemo(() => {
    const today = dateKey(now); const pending = tasks.filter((task) => !task.done);
    const overdue = pending.filter((task) => task.due < today).length;
    const dueToday = pending.filter((task) => task.due === today).length;
    const high = pending.filter((task) => task.priority === 'High').length;
    const score = overdue * 5 + dueToday * 3 + high;
    if (score >= 8) return { level: 'critical', label: 'Needs attention', color: '181, 55, 52', intensity: 1.8, score, message: `${overdue + dueToday} urgent item${overdue + dueToday === 1 ? '' : 's'} need a decision.` };
    if (score >= 3) return { level: 'watch', label: 'Active watch', color: '179, 105, 38', intensity: 1.25, score, message: `${dueToday} due today · ${high} high priority.` };
    return { level: 'clear', label: 'System clear', color: '18, 18, 22', intensity: .75, score, message: 'No urgent work is competing for attention.' };
  }, [tasks, now]);

  const pendingTasks = tasks.filter((task) => !task.done);
  const nextDeadline = [...pendingTasks].sort((a, b) => a.due.localeCompare(b.due))[0];
  const avgProgress = Math.round(projects.reduce((sum, item) => sum + item.progress, 0) / Math.max(projects.length, 1));
  const dateLabel = new Intl.DateTimeFormat('en-ZA', { weekday: 'short', day: '2-digit', month: 'short' }).format(now);
  const timeLabel = new Intl.DateTimeFormat('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false }).format(now);

  function log(message) { setActivity(message); }
  function toggleTask(id) {
    const task = tasks.find((item) => item.id === id);
    setTasks((items) => items.map((item) => item.id === id ? { ...item, done: !item.done } : item));
    log(`${task?.title || 'Task'} ${task?.done ? 'reopened' : 'completed'}.`);
  }
  function bumpProject(id) {
    const project = projects.find((item) => item.id === id);
    setProjects((items) => items.map((item) => item.id === id ? { ...item, progress: Math.min(100, item.progress + 5) } : item));
    log(`${project?.name || 'Project'} moved forward by 5%.`);
  }
  function focus(area, label) { setFocusArea(area); log(`${label} brought into focus.`); }
  function moveWidget(id, position) { setWidgets((items) => ({ ...items, [id]: { ...items[id], ...position } })); }
  function closeExpandedWidget() {
    if (expandedWidget === 'briefing' && briefingGate) { localStorage.setItem('vk-last-briefing-cycle', briefingCycleKey(now)); setBriefingGate(false); }
    setExpandedWidget(null);
  }
  const widgetSeverity = {
    projects: projects.some((project) => project.deadline <= shiftDate(2) && project.progress < 90) ? 'watch' : 'clear',
    tasks: system.level,
    briefing: system.level,
    signals: 'idle',
    schedule: nextDeadline?.due === dateKey(now) ? 'watch' : 'clear',
  };

  if (!unlocked) return <PinGate pinHash={pinHash} setPinHash={setPinHash} onUnlock={() => { sessionStorage.setItem('vk-unlocked', 'true'); setUnlocked(true); }} />;

  return <div className={`vk-app state-${system.level}`}>
    <header className="vk-topbar">
      <button className="hamburger" onClick={() => setMenuOpen(true)} aria-label="Open command wheel"><Menu size={19} /></button>
      <div className="vk-wordmark"><span>VK</span><small>PERSONAL INTELLIGENCE</small></div>
      <div className="top-status"><i /><span>{system.label}</span><b>{system.score.toString().padStart(2, '0')}</b></div>
      <div className="top-time"><span>{dateLabel}</span><strong>{timeLabel}</strong></div>
      <button className="top-icon" aria-label="Notifications"><Bell size={17} /><i /></button>
      <button className="capture-button" onClick={() => setCaptureOpen(true)}><Plus size={16} /> Capture</button>
    </header>

    <main className="open-plan" aria-label="VK open plan dashboard">
      <div className="open-core">
        <button className="open-sphere" onClick={() => { setExpandedWidget('briefing'); focus('briefing', 'VK'); }} aria-label="Interact with VK and expand briefing">
          <span className="sphere-halo halo-one" /><span className="sphere-halo halo-two" />
          <AnimatedSphere className="live-sphere" particleColor="18, 18, 22" intensity={system.intensity} interactive />
        </button>
        <div className="core-readout"><strong>{system.message}</strong><small>{activity}</small></div>
      </div>

      <MovableWidget id="projects" box={widgets.projects} severity={widgetSeverity.projects} eyebrow={`${projects.length} ACTIVE`} title="Projects" icon={<FolderKanban size={14} />} onMove={moveWidget} onExpand={setExpandedWidget}>
        <div className="compact-projects">{projects.map((project) => <div className="project-item" key={project.id}><div className="item-line"><strong>{project.name}</strong><button onClick={() => bumpProject(project.id)}>+5%</button></div><div className="progress"><i style={{ width: `${project.progress}%` }} /></div><div className="item-meta"><span>{project.status}</span><span>{project.progress}%</span></div></div>)}</div>
      </MovableWidget>

      <MovableWidget id="tasks" box={widgets.tasks} severity={widgetSeverity.tasks} eyebrow={`${pendingTasks.length} OPEN`} title="Tasks & deadlines" icon={<Check size={14} />} onMove={moveWidget} onExpand={setExpandedWidget}>
        <div className="compact-tasks">{pendingTasks.slice(0, 4).map((task) => <button className="task-item" key={task.id} onClick={() => toggleTask(task.id)}><span className="checkmark" /><span className="task-copy"><strong>{task.title}</strong><small>{formatDue(task.due)} · {task.project}</small></span><span className={`priority p-${task.priority.toLowerCase()}`}>{task.priority[0]}</span></button>)}</div>
      </MovableWidget>

      <MovableWidget id="briefing" box={widgets.briefing} severity={widgetSeverity.briefing} eyebrow="LIVE BRIEFING" title="What matters now" icon={<Sparkles size={14} />} onMove={moveWidget} onExpand={setExpandedWidget}>
        <div className="briefing-content"><p>{system.level === 'critical' ? 'Clear urgent work before opening another lane.' : 'Your workspace is moving without major blockers.'}</p><div className="brief-stats"><div><strong>{pendingTasks.length}</strong><span>open</span></div><div><strong>{avgProgress}%</strong><span>progress</span></div><div><strong>{nextDeadline ? formatDue(nextDeadline.due) : '—'}</strong><span>next due</span></div></div>{nextDeadline && <button className="suggestion" onClick={() => setExpandedWidget('tasks')}><AlertTriangle size={13} /><span><small>VK SUGGESTS</small><strong>{nextDeadline.title}</strong></span><ChevronRight size={13} /></button>}</div>
      </MovableWidget>

      <MovableWidget id="signals" box={widgets.signals} severity={widgetSeverity.signals} eyebrow="MARKETS" title="Signals" icon={<CircleDollarSign size={14} />} onMove={moveWidget} onExpand={setExpandedWidget} compact>
        <div className="connection-state"><Bitcoin size={14} /><div><strong>BTC · XAUUSD</strong><small>Feed not connected</small></div><span>SET UP</span></div>
      </MovableWidget>

      <MovableWidget id="schedule" box={widgets.schedule} severity={widgetSeverity.schedule} eyebrow="CALENDAR" title="Schedule" icon={<CalendarDays size={14} />} onMove={moveWidget} onExpand={setExpandedWidget} compact>
        <div className="schedule-row"><div><strong>10:30</strong><span>Architecture review</span></div><div><strong>{nextDeadline ? formatDue(nextDeadline.due) : 'Clear'}</strong><span>Next deadline</span></div></div>
      </MovableWidget>

    </main>

    <main className="control-grid legacy-layout" hidden>
      <section className={`rail left-rail ${focusArea === 'projects' || focusArea === 'tasks' ? 'focused' : ''}`}>
        <Panel id="projects" eyebrow={`${projects.length} ACTIVE`} title="Project momentum" icon={<FolderKanban size={15} />} onFocus={() => setFocusArea('projects')}>
          <div className="compact-projects">{projects.map((project) => <div className="project-item" key={project.id}>
            <div className="item-line"><strong>{project.name}</strong><button onClick={() => bumpProject(project.id)}>+5%</button></div>
            <div className="progress"><i style={{ width: `${project.progress}%` }} /></div>
            <div className="item-meta"><span>{project.status}</span><span>{project.progress}%</span></div>
          </div>)}</div>
        </Panel>
        <Panel id="tasks" eyebrow={`${pendingTasks.length} OPEN`} title="Today’s work" icon={<Check size={15} />} onFocus={() => setFocusArea('tasks')}>
          <div className="compact-tasks">{tasks.slice(0, 5).map((task) => <button className={`task-item ${task.done ? 'done' : ''}`} key={task.id} onClick={() => toggleTask(task.id)}>
            <span className="checkmark">{task.done && <Check size={11} />}</span><span className="task-copy"><strong>{task.title}</strong><small>{task.project}</small></span><span className={`priority p-${task.priority.toLowerCase()}`}>{task.priority[0]}</span>
          </button>)}</div>
        </Panel>
      </section>

      <section className="intelligence-core">
        <div className="core-heading"><span>VK / ACTIVE AWARENESS</span><strong>{system.message}</strong></div>
        <div className="core-map">
          <svg className="core-links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">{nodeItems.map((node) => <line key={node.label} x1="50" y1="50" x2={node.x} y2={node.y} />)}</svg>
          {nodeItems.map(({ label, icon: Icon, area, x, y }) => <button key={label} className={`core-node ${focusArea === area ? 'active' : ''}`} style={{ '--x': `${x}%`, '--y': `${y}%` }} onClick={() => focus(area, label)}><Icon size={14} /><span>{label}</span>{area === 'tasks' && pendingTasks.length > 0 && <b>{pendingTasks.length}</b>}</button>)}
          <button className="sphere-shell" onClick={() => focus('briefing', 'VK')} aria-label="Open VK briefing">
            <span className="sphere-halo halo-one" /><span className="sphere-halo halo-two" />
            <AnimatedSphere className="live-sphere" particleColor={system.color} intensity={system.intensity} />
            <span className="sphere-label"><strong>VK</strong><small>{system.label}</small></span>
          </button>
        </div>
        <div className="activity-strip"><span><Radio size={12} /> LIVE</span><p>{activity}</p><time>{timeLabel}</time></div>
      </section>

      <section className={`rail right-rail ${['briefing', 'signals', 'schedule'].includes(focusArea) ? 'focused' : ''}`}>
        <Panel id="briefing" eyebrow="DAILY BRIEFING" title="What matters now" icon={<Sparkles size={15} />} onFocus={() => setFocusArea('briefing')}>
          <div className="briefing-content"><p>{system.level === 'critical' ? 'Clear the urgent work before opening another lane.' : 'Your workspace is moving without major blockers.'}</p>
            <div className="brief-stats"><div><strong>{pendingTasks.length}</strong><span>open tasks</span></div><div><strong>{avgProgress}%</strong><span>avg progress</span></div><div><strong>{nextDeadline ? formatDue(nextDeadline.due) : '—'}</strong><span>next due</span></div></div>
            {nextDeadline && <button className="suggestion" onClick={() => setFocusArea('tasks')}><AlertTriangle size={14} /><span><small>VK SUGGESTS</small><strong>{nextDeadline.title}</strong></span><ChevronRight size={14} /></button>}
          </div>
        </Panel>
        <div className="mini-panel-row">
          <Panel id="signals" eyebrow="MARKETS" title="Signals" icon={<CircleDollarSign size={15} />} onFocus={() => setFocusArea('signals')} compact>
            <div className="connection-state"><Bitcoin size={15} /><div><strong>BTC · XAUUSD</strong><small>Feed not connected</small></div><span>SET UP</span></div>
          </Panel>
          <Panel id="schedule" eyebrow="CALENDAR" title="Next up" icon={<CalendarDays size={15} />} onFocus={() => setFocusArea('schedule')} compact>
            <div className="next-event"><strong>10:30</strong><span>Architecture review</span></div>
          </Panel>
        </div>
        <Panel id="connections" eyebrow="CONNECTIONS" title="External activity" icon={<Server size={15} />}>
          <div className="connections"><div><Github size={14} /><span>GitHub</span><small>Not connected</small></div><div><Server size={14} /><span>Vercel</span><small>Not connected</small></div><div><Trophy size={14} /><span>Sports</span><small>Not connected</small></div></div>
        </Panel>
      </section>
    </main>

    <footer className="vk-footer"><span className={`cloud-state ${cloudStatus}`}><i />{cloudStatus === 'connected' ? 'SUPABASE CONNECTED · LOCAL-FIRST' : cloudStatus === 'checking' ? 'CHECKING SUPABASE · LOCAL-FIRST' : cloudStatus === 'unreachable' ? 'SUPABASE OFFLINE · SAVED LOCALLY' : 'LOCAL-FIRST · SAVED ON THIS DEVICE'}</span><button onClick={() => { sessionStorage.removeItem('vk-unlocked'); setUnlocked(false); }}>LOCK VK</button></footer>
    {menuOpen && <CommandMenu current={focusArea} onClose={() => setMenuOpen(false)} onSelect={(item) => { const area = item.toLowerCase(); setFocusArea(area); setExpandedWidget(area); setMenuOpen(false); log(`${item} opened from command wheel.`); }} />}
    {captureOpen && <QuickCapture projects={projects} onClose={() => setCaptureOpen(false)} onAdd={(task) => { setTasks((items) => [{ ...task, id: Date.now(), done: false }, ...items]); setCaptureOpen(false); setFocusArea('tasks'); log(`${task.title} added as ${task.priority.toLowerCase()} priority.`); }} />}
    {expandedWidget && <ExpandedWidget id={expandedWidget} projects={projects} tasks={tasks} system={system} nextDeadline={nextDeadline} avgProgress={avgProgress} dailyBriefing={briefingGate} onClose={closeExpandedWidget} onToggleTask={toggleTask} onBumpProject={bumpProject} />}
  </div>;
}

function MovableWidget({ id, box, severity, eyebrow, title, icon, children, onMove, onExpand, compact = false }) {
  const drag = React.useRef(null);
  function pointerDown(event) {
    if (event.target.closest('button')) return;
    const canvas = event.currentTarget.closest('.open-plan');
    if (!canvas) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: box.x, y: box.y, rect: canvas.getBoundingClientRect() };
  }
  function pointerMove(event) {
    if (!drag.current) return;
    const nextX = Math.min(100 - box.w, Math.max(0, drag.current.x + (event.clientX - drag.current.startX) / drag.current.rect.width * 100));
    const nextY = Math.min(100 - box.h, Math.max(0, drag.current.y + (event.clientY - drag.current.startY) / drag.current.rect.height * 100));
    onMove(id, { x: Number(nextX.toFixed(2)), y: Number(nextY.toFixed(2)) });
  }
  function pointerUp(event) { if (drag.current) event.currentTarget.releasePointerCapture?.(drag.current.pointerId); drag.current = null; }
  return <article className={`floating-widget severity-${severity} ${compact ? 'compact' : ''}`} style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.w}%`, height: `${box.h}%` }}>
    <header className="floating-head" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}><div className="drag-mark"><GripHorizontal size={13} /></div><div className="floating-title"><span>{eyebrow}</span><h2>{title}</h2></div><div className="floating-actions">{icon}<button onClick={() => onExpand(id)} aria-label={`Expand ${title}`}><Maximize2 size={13} /></button></div></header>
    <div className="floating-body">{children}</div>
  </article>;
}

function ExpandedWidget({ id, projects, tasks, system, nextDeadline, avgProgress, dailyBriefing, onClose, onToggleTask, onBumpProject }) {
  const names = { projects: 'Projects', tasks: 'Tasks & deadlines', briefing: 'VK briefing', signals: 'Market signals', schedule: 'Schedule' };
  const openTasks = tasks.filter((task) => !task.done); const completed = tasks.length - openTasks.length;
  return <div className="expanded-backdrop"><section className="expanded-panel"><header><div><span>{id === 'briefing' && dailyBriefing ? 'DAILY BRIEFING / 06:00 CYCLE' : 'VK / FOCUSED WORKSPACE'}</span><h2>{names[id]}</h2></div><div className="expanded-header-meta"><span>{id === 'briefing' && dailyBriefing ? 'Prepared for your first open' : 'Everything else is quiet'}</span><button onClick={onClose} aria-label="Close expanded dashboard"><X size={18} /></button></div></header>
    <div className="expanded-content expanded-dashboard">
      {id === 'projects' && <><section className="expanded-hero"><div><span>PORTFOLIO VIEW</span><h3>{projects.length} projects moving at {avgProgress}% average progress.</h3></div><div className="hero-metrics"><div><strong>{projects.length}</strong><small>active</small></div><div><strong>{projects.filter((item) => item.progress >= 80).length}</strong><small>near finish</small></div><div><strong>{avgProgress}%</strong><small>momentum</small></div></div></section><div className="project-dashboard-grid">{projects.map((project) => <article className="project-dashboard-card" key={project.id}><header><span>{project.status}</span><b>{project.progress}%</b></header><h3>{project.name}</h3><p>Deadline · {project.deadline}</p><div className="expanded-progress"><i style={{ width: `${project.progress}%` }} /></div><button onClick={() => onBumpProject(project.id)}>Advance progress <ArrowRight size={14} /></button></article>)}</div></>}
      {id === 'tasks' && <><section className="expanded-hero"><div><span>EXECUTION VIEW</span><h3>{openTasks.length} open tasks, ordered by urgency.</h3></div><div className="hero-metrics"><div><strong>{openTasks.length}</strong><small>open</small></div><div><strong>{openTasks.filter((task) => task.priority === 'High').length}</strong><small>high priority</small></div><div><strong>{completed}</strong><small>completed</small></div></div></section><div className="task-dashboard"><div className="task-dashboard-head"><span>TASK</span><span>PROJECT</span><span>DUE</span><span>PRIORITY</span></div>{tasks.map((task) => <button className={`task-dashboard-row ${task.done ? 'done' : ''}`} key={task.id} onClick={() => onToggleTask(task.id)}><span className="checkmark">{task.done && <Check size={11} />}</span><strong>{task.title}</strong><span>{task.project}</span><time>{formatDue(task.due)}</time><em className={`p-${task.priority.toLowerCase()}`}>{task.priority}</em></button>)}</div></>}
      {id === 'briefing' && <div className="brief-dashboard"><section className="brief-focus"><div className={`brief-orb state-${system.level}`}><Sparkles size={22} /></div><span>VK / CURRENT READ</span><h3>{system.message}</h3><p>{system.level === 'critical' ? 'Urgent work is competing for the same window. Close or reschedule the nearest deadline before opening another lane.' : 'Your plan is balanced. Keep moving the highest-priority project.'}</p></section><aside className="brief-queue"><span>ATTENTION QUEUE</span>{openTasks.slice(0, 4).map((task, index) => <button key={task.id} onClick={() => onToggleTask(task.id)}><b>0{index + 1}</b><div><strong>{task.title}</strong><small>{task.project} · {formatDue(task.due)}</small></div><ChevronRight size={14} /></button>)}</aside><div className="expanded-metrics"><div><strong>{openTasks.length}</strong><span>open tasks</span></div><div><strong>{avgProgress}%</strong><span>project progress</span></div><div><strong>{nextDeadline ? formatDue(nextDeadline.due) : 'Clear'}</strong><span>nearest deadline</span></div></div></div>}
      {id === 'signals' && <><section className="expanded-hero"><div><span>MARKET WATCH</span><h3>BTC and XAUUSD, ready for a live source.</h3></div></section><div className="signal-dashboard"><div className="signal-placeholder"><Bitcoin size={24} /><span>BTC / USD</span><strong>—</strong><small>Awaiting price feed</small></div><div className="signal-placeholder"><CircleDollarSign size={24} /><span>XAU / USD</span><strong>—</strong><small>Awaiting price feed</small></div><EmptyConnection icon={<Radio size={22} />} title="Connect market data" copy="The interface is ready. Add a provider to activate charts, movement and alerts." /></div></>}
      {id === 'schedule' && <><section className="expanded-hero"><div><span>TIME VIEW</span><h3>Today and the nearest commitments.</h3></div><div className="hero-metrics"><div><strong>1</strong><small>event today</small></div><div><strong>{openTasks.length}</strong><small>task deadlines</small></div></div></section><div className="schedule-dashboard"><div className="schedule-day"><span>TODAY</span><strong>24</strong><small>September</small></div><div className="schedule-timeline"><div><time>10:30</time><i /><section><strong>Architecture review</strong><span>VK Command Centre · Focus block</span></section></div>{nextDeadline && <div><time>{formatDue(nextDeadline.due)}</time><i /><section><strong>{nextDeadline.title}</strong><span>{nextDeadline.project} · {nextDeadline.priority} priority</span></section></div>}</div></div></>}
    </div>
  </section></div>;
}

function EmptyConnection({ icon, title, copy }) { return <div className="empty-connection">{icon}<h3>{title}</h3><p>{copy}</p><button>Connect source</button></div>; }

function Panel({ id, eyebrow, title, icon, children, onFocus, compact = false }) {
  return <article id={id} className={`data-panel ${compact ? 'compact' : ''}`} onClick={onFocus}><div className="panel-heading"><div><span>{eyebrow}</span><h2>{title}</h2></div>{icon}</div>{children}</article>;
}

function PinGate({ pinHash, setPinHash, onUnlock }) {
  const [value, setValue] = useState(''); const [error, setError] = useState(false);
  async function digest(pin) { const bytes = new TextEncoder().encode(pin); const hash = await crypto.subtle.digest('SHA-256', bytes); return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, '0')).join(''); }
  async function submit(event) { event.preventDefault(); if (value.length < 4) return; const next = await digest(value); if (!pinHash) { localStorage.setItem('vk-pin-hash', next); setPinHash(next); onUnlock(); return; } if (next === pinHash) onUnlock(); else { setError(true); setValue(''); } }
  return <main className="pin-gate"><form onSubmit={submit}><div className="pin-logo">VK</div><label htmlFor="pin">{pinHash ? 'Enter PIN' : 'Create PIN'}</label><input id="pin" autoFocus type="password" inputMode="numeric" autoComplete="current-password" maxLength="6" value={value} onChange={(event) => { setError(false); setValue(event.target.value.replace(/\D/g, '')); }} placeholder="••••••" aria-invalid={error} /><button disabled={value.length < 4}>Enter <ArrowRight size={16} /></button>{error && <small>Wrong PIN</small>}</form></main>;
}

function QuickCapture({ projects, onClose, onAdd }) {
  const [title, setTitle] = useState(''); const [project, setProject] = useState(projects[0]?.name || 'Personal'); const [priority, setPriority] = useState('Medium'); const [due, setDue] = useState(shiftDate(0));
  return <div className="modal-backdrop" onClick={onClose}><form className="capture-modal" onSubmit={(event) => { event.preventDefault(); if (title.trim()) onAdd({ title: title.trim(), project, priority, due }); }} onClick={(event) => event.stopPropagation()}><div className="modal-head"><div><span>QUICK CAPTURE</span><h2>Add something real.</h2></div><button type="button" onClick={onClose}><X size={17} /></button></div><input className="capture-title" autoFocus placeholder="What needs to happen?" value={title} onChange={(event) => setTitle(event.target.value)} /><div className="capture-fields"><label>Project<select value={project} onChange={(event) => setProject(event.target.value)}>{projects.map((item) => <option key={item.id}>{item.name}</option>)}</select></label><label>Priority<select value={priority} onChange={(event) => setPriority(event.target.value)}><option>Low</option><option>Medium</option><option>High</option></select></label><label>Due<input type="date" value={due} onChange={(event) => setDue(event.target.value)} /></label></div><button className="save-task">Add task <ArrowRight size={15} /></button></form></div>;
}

function CommandMenu({ current, onClose, onSelect }) {
  const items = ['Briefing', 'Projects', 'Tasks', 'Schedule', 'Signals']; const selected = Math.max(0, items.findIndex((item) => item.toLowerCase() === current));
  return <div className="wheel-backdrop" onClick={onClose}><section className="wheel-menu" onClick={(event) => event.stopPropagation()}><div className="wheel-head"><div><span>VK / NAVIGATION</span><h2>Choose a system.</h2></div><button onClick={onClose}><X size={18} /></button></div><div className="wheel-wrap"><OptionWheel items={items} defaultSelected={selected} side="right" fontSize={2.3} spacing={1.55} tilt={7} curve={1.1} blur={.18} fade={.14} minOpacity={.28} inset={60} textColor="#68686e" activeColor="#121216" onSelect={(_, item) => onSelect(item)} /></div><footer><span><Command size={12} /> Scroll or drag · Enter to open</span></footer></section></div>;
}

function formatDue(value) { const diff = Math.ceil((new Date(`${value}T23:59:59`) - new Date()) / DAY); if (diff < 0) return `${Math.abs(diff)}d late`; if (diff === 0) return 'Today'; if (diff === 1) return 'Tomorrow'; return `${diff} days`; }

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() { return this.state.error ? <pre style={{ padding: 24, whiteSpace: 'pre-wrap' }}>{this.state.error.stack || this.state.error.message}</pre> : this.props.children; }
}

createRoot(document.getElementById('root')).render(<ErrorBoundary><App /></ErrorBoundary>);

if ('serviceWorker' in navigator && import.meta.env.PROD) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
