# Personal control point implementation

Implemented research items 1, 3, 4, 5, 6, and 7.

## Using it

- **Home:** next task that fits known capacity, next commitment, attention briefing, quick thought capture, and project resume. The orb opens Attention and changes colour when something needs attention. Navigation remains the hamburger and OptionWheel.
- **Thoughts:** type directly on Home and press Enter to save; Shift+Enter adds a line. Capture is also available from every view. Thoughts need no deadline or project. Inbox supports editing, context/type filters, archive/restore, deletion undo, and conversion into a task while preserving the original text.
- **Plan:** enter commitments, plan tasks for a day, add estimates, and configure working hours and meeting buffers. Overlapping commitments are merged; elapsed time is excluded from today's capacity. Missing estimates and over-capacity days are explicit. Scheduled days account for durations; they do not create task time blocks or external calendar events.
- **Attention:** combines task deadlines, approaching commitments, project blockers, manual source-linked items, and public GitHub issues/PRs. GitHub refresh reads the latest 50 updates on request, deduplicates items, and preserves snooze/dismiss choices. This is a bounded feed, not a complete repository inventory.
- **Projects:** next action, checkpoint, blocker, resource link, and milestones. Progress comes from completed milestones rather than arbitrary percentage increments.
- **Life:** personal, study, and work tasks, with daily/weekly/monthly/yearly recurring obligations. Completion creates the next future occurrence; month-end dates retain their original anchor.
- **Settings:** working hours, buffers, JSON export and validated restore.

## Data and connections

Records are saved transactionally in IndexedDB on this browser/device. Existing local task/project records migrate without deleting their original storage keys. Multiple tabs read the latest stored document before editing and receive change notifications. Save success appears only after the storage transaction completes; failed saves preserve input.

The PIN is a local privacy gate, not encrypted storage or server authentication. Export backups before clearing browser data or switching devices. External calendars, private GitHub repositories, account OAuth, and cloud synchronization are not connected. Public GitHub data is real; manual commitments are labelled accordingly. The production service worker caches the versioned application shell for offline use, excluding API responses.

## Verification

- `npm test`: 16 passing model tests covering date labels, ranking, attention, planning capacity, recurrence, migration, restore validation, and GitHub mapping/errors.
- `npm run build`: passes; build script creates an offline shell manifest with seven assets and a content-derived cache version.
- Browser: thought save/reload/edit/archive/restore/task conversion; daily recurring completion; milestone/checkpoint persistence; manual commitment and buffered free windows; real public GitHub refresh, deduplication, and retained snooze; simulated storage failure preserving typed text; JSON restore; production offline reload retaining a saved thought.
- Visual inspection at 1440×900 and 390×844, plus tablet checks at 768×1024. Desktop Home fits one viewport in the tested state; mobile/tablet have no horizontal overflow, and the capture dialog focuses its textarea.
- `git diff --check`: passes. Screenshots: `vk-implemented-desktop.png`, `vk-implemented-mobile.png`.

Implementation remains local; no deployment was performed. Independent browser QA was completed, but an evaluator from a different model provider was unavailable in this environment.

## Mobile navigation refinement

Phones and touch-primary devices use native momentum scrolling with centered snap targets, 64px rows, a selection band, and an explicit Open button. Swiping updates selection without navigating; tapping a visible space opens it directly. Per-label animation and blur are skipped in this mode. Desktop retains the curved wheel. The picker adapts to short screens, supports arrow keys/Home/End/Enter, and exposes its active option to assistive technology.

Browser verification covered snap selection without background page movement, first/last items, opening the highlighted space, keyboard selection, mobile-to-desktop resizing, and a 320×568 screen with no inner dialog overflow. Also checked 390×844, 768×1024, and 1440×900. Build and diff checks pass. This is browser verification; physical-device touch feel was not tested.


## Live dashboard report
The authenticated owner can request GET /api/daily-report. Supabase user verification and an RLS workspace read run before any provider request. Provider keys stay in server environment variables. Vite exposes only VITE-prefixed public settings; its development middleware uses the same handler.
The server gathers CoinGecko crypto, Twelve Data gold and USD/ZAR, GNews technology headlines, BALLDONTLIE NBA, optional football-data.org fixtures, public GitHub repositories and Vercel deployments. Gold API is a fallback. Gemini summarizes only public feed facts through the Interactions API. Missing or failed feeds remain explicit while other feeds continue. Results cache for ten minutes per server process and HTTP responses are private/no-store.
Priority TeachersVIP, NovaLens/Cris and Kganya balances come from the shared debtor ledger and open its existing editor. Payments update the same shared records across devices.
