# ResourceFlow — Server Resource Request & Allocation (Portfolio Demo)

> **Portfolio Demo — Simulated data only. Not connected to any real system.**

An independently built, frontend-only demonstration of a server-resource workflow:
request → approve or reject → allocate → simulate usage → return or expire.

This is a personal portfolio exercise. It is not a production system, it is not an
official system of any institution, and it does not represent or reproduce any
organisation's internal software. All users, email addresses (`@example.com`),
resource pools and history are fictional.

## Stack

| Package | Version |
| --- | --- |
| Next.js (App Router, static export) | 16.4.0 |
| React / React DOM | 19.3.0 |
| TypeScript | 5.9.3 |
| Tailwind CSS | 3.4.19 |
| Vitest / Vite | 5.0.4 / 8.3.4 |

Versions are pinned exactly in `package.json`.

## Commands

```bash
npm install      # install pinned dependencies
npm run dev      # local development server
npm run typecheck # tsc --noEmit
npm test         # vitest run
npm run build    # production build + static export to ./out
```

### Turn off Next.js telemetry

Next.js collects anonymous usage telemetry by default. This project is meant to make
no network calls at all, so disable it once per machine:

```bash
npx next telemetry disable
```

Or set `NEXT_TELEMETRY_DISABLED=1` in your shell before running any `next` command.

### Platform note

`node_modules` contains platform-specific native binaries (`@next/swc-*`,
`lightningcss-*`, `@rolldown/binding-*`). Install and run the build and tests on the
same operating system. Moving a `node_modules` folder between Windows, macOS and
Linux will not work; run `npm install` again on the new platform instead.

## Try the demo in five minutes

Run `npm run dev`, then use the persona selector in the header to switch roles. Nothing
below leaves your browser.

1. **File a request** — as *Aree Boonmee (Student / Requester)*, go to **Create Request**.
   Try a negative quantity or an empty purpose first: the form explains each problem, and the
   workflow rules validate the same draft again before anything is stored.
2. **Try to approve your own request** — switch to *Sunee Thongdee (Approver)*, open the
   **Approval Queue**, and find RF-1005, which she filed herself. The row is listed but marked
   *Your own request*: separation of duties is enforced in the rules, not by hiding the button.
3. **Decide somebody else's request** — switch to *Dr. Pradit Chaiyo (Approver)* and approve or
   reject a pending request. A rejection needs a reason; leaving it blank is refused.
4. **Allocate** — switch to *Watcharin P. (Administrator)*, open **Allocations**, and allocate the
   request you just approved. The dialog shows what is available before you commit, and
   **Resource Capacity** moves the moment it succeeds.
5. **Return or expire** — return the allocation as its owner, or force it to expire as the
   administrator with a reason. Capacity goes straight back; the baseline never moves.
6. **Read the trail** — **Demo Audit Trail** lists every action, including the ones that were
   refused. **Roles & Permissions** generates its matrix by calling the real permission function.
7. **Start over** — **Reset Demo Data** (administrator only) restores the sample data. It replaces
   the audit log too, and says so before you confirm.

### Checking the claims yourself

- `npm test` runs the rule layer: workflow transitions, permissions, capacity arithmetic,
  storage recovery and the audit log.
- Open DevTools → Network while using the app: there are no requests. All state lives in
  `localStorage` under `cloudflow_demo.v1`.
- Damage that key deliberately (paste `{ broken` into it and reload): the app backs the damaged
  value up under `cloudflow_demo.corrupt.<timestamp>`, loads the sample data and tells you what
  happened, instead of crashing.

## Boundaries this project keeps

- Frontend only. No backend, no database, no API routes, no server actions.
- No external network calls at runtime, no analytics, no remote fonts or assets.
- No credentials, secrets, tokens or `.env` files.
- The role selector is a **simulation**, not authentication. There is no password,
  no token and no identity provider. Permission checks run in the browser and are
  **not production security**.
- All state lives in `localStorage` under `cloudflow_demo.v1`, with validation and a
  reset-to-default path.

## Layout

```
src/
  app/          routes (one folder per screen)
  components/   layout shell, UI primitives, domain components
  lib/          types, seed data, storage, permission rules, workflow rules
  state/        React context that binds lib/ to the UI
  tests/        Vitest specs for the pure rule layer
```

`src/lib/` holds no React and no DOM access, so the workflow and permission rules are
testable directly and cannot be bypassed from the UI.
