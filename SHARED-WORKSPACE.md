# Shared personal workspace

## Implemented

- Supabase email/password sign-in, recovery, and one-owner registration.
- A private one-use setup link protects first signup. A database trigger locks the registration row, claims the seeded workspace, consumes the setup secret, and rejects all subsequent account creation, including direct Auth requests.
- Owner-only RLS; no anonymous access to the workspace or private import.
- Revision-checked saves, field-level conflict detection, an IndexedDB outbox, offline edits, cross-tab locking, Realtime refresh, and a 15-second polling fallback.
- Background, Business, and Debtors sections plus categorised project records.
- Unknown debtor amounts, partial receipts, paid/cancelled states, linked projects, notes, and source information.
- Version-1 backup migration, non-destructive backup merge, and import of the old device-only workspace.

Personal records are **not** shipped in the frontend bundle or committed to Git. Files under `.private/` are ignored. Keep setup SQL and links private too.

## Activation

The configured project is `cldqytpnxjdzyerwsmnn`. The CLI login available during implementation could list other projects but received a permission error for this project. The user subsequently reported applying the prepared SQL and Auth configuration through the dashboard. Live checks on 27 September 2026 confirmed that the registration table is available with `is_open=true`, email/password signup is enabled, email confirmation is required, and anonymous workspace access is denied. The private bootstrap contents cannot be read anonymously; owner signup and authenticated import/sync verification are still pending.

1. Authenticate the Supabase CLI with an account that owns the configured VK project: `npx supabase login`.
2. Verify this is the dedicated VK project and has no existing Auth users. The migration refuses to change an already-populated Auth project.
3. Apply `supabase/migrations/20260927075055_shared_personal_workspace.sql` using the project's SQL editor or authenticated CLI. Keep an applied migration history entry through the normal Supabase release workflow.
4. Run `.private/bootstrap.sql` in the **same project**. It loads the private import and one-use setup-code hash. It refuses to overwrite an owned workspace.
5. In Supabase Auth, enable email/password and configure the deployed VK origin as Site URL and an allowed redirect URL. Add `http://localhost:5173` if signing up locally. Confirm email delivery/SMTP works. Keep email confirmation enabled.
6. Open `.private/setup-link.txt` and use that link to register the owner. Replace only the origin if using the deployed site. Verify the email and sign in. The user chooses their own password; no owner credential has been created by the agent.
7. Sign in on a second device using the same account. Verify additions and edits in both directions before claiming live sync complete.

Do not share the setup link or deploy it as a public asset. Its random secret prevents a stranger from claiming the workspace before the intended owner. Registration stays closed even if someone tries to reuse the link.

The production home page shows the owner-signup form whenever registration is open. Opening the private setup link supplies the setup key automatically; visiting the home page directly offers a setup-key field. After account creation, the same home page becomes sign-in only. A private production setup link is saved locally in `.private/production-setup-link.txt`.

## Private import preparation

```powershell
node scripts/prepare-workspace.mjs .private/workspace-import.json
```

This creates `.private/bootstrap.sql`, `.private/setup-code.txt`, and `.private/setup-link.txt`. It retains the same setup code across reruns. `.private/setup-workspace.sql` is a combined copy of the migration and bootstrap for a fresh, empty project only.

## Sync and recovery

- Use the same owner account on each device. There is no public signup or team invitation after initial registration.
- A successful local save can still be queued. The footer reports pending edits, offline state, connection errors, and completed sync.
- A same-field conflict keeps local edits. Settings offers export, cloud version, or explicitly keeping local edits; unrelated remote changes are preserved.
- Backups merge by stable ID. Reimporting identical data does not duplicate records; conflicting IDs require review.
- Device caches are not independently encrypted. A server sign-out is distinct from wiping a device cache. Use trusted devices and operating-system protection.
- An admin can recover an unverified owner account via Supabase Auth if confirmation delivery fails; do not reopen public signup or discard the seeded workspace as a workaround.

## Verification captured

- 24 Node tests pass, including a real Postgres engine (PGlite) exercising the migration, private seed, one-owner trigger, RLS, immutable ownership, revision checks, and invalid debt handling.
- Production build and `git diff --check` pass.
- Two isolated browser sessions used a local test Auth/REST adapter backed by the actual Postgres schema. Cross-session additions, offline/online merging, and debtor receipt updates were verified.
- Mobile Debtors at 390 × 844 visually inspected. Personal QA screenshots stay under `.private/`.
- Folio status came from a read-only checkout inspection of its roadmap, Git history, document processing, passkey, and mobile session/biometric source. No Folio code was changed, and no new Folio production/device test was claimed.
- Live hosted registration status, email-auth settings, and anonymous workspace denial were verified after dashboard setup. First signup/email delivery, authenticated imported records, production Realtime, and physical-device sync remain unverified until activation above.

Documentation consulted: [Supabase password auth](https://supabase.com/docs/guides/auth/passwords), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), and [changelog](https://supabase.com/changelog).
