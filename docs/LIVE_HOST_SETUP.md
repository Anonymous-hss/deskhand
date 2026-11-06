# Live host configuration and verification

The checkout is based on upstream `22cba6d`. Local iOS work was preserved while resolving the gateway conflict. The backup stash `codex-ios-before-upstream-22cba6d` remains available.

## Run

```sh
npm ci
npm run build
npx playwright install chromium
npm run config:check
npm run dev
```

On this Mac, Chromium is already installed in Playwright's standard cache. The ignored `.env` contains the supplied Azure Responses endpoint, `gpt-4o` deployment and credentials, plus the requested generalized-browsing flags. `.env` has owner-only filesystem permissions; no key is in tracked source files.

The complete configured Azure endpoint is used directly. Resource-root and `/openai/v1` base endpoints are also supported. The legacy `AI_API_KEY` alias is accepted, but `AZURE_OPENAI_API_KEY` takes priority. Invalid configuration fails before reserving a model call. Live mode never silently falls back to deterministic actions.

Browser screenshots and DOM snapshots are sent to the configured Azure deployment. Strict Structured Outputs constrain browser plans; runtime validation checks actions, targets, risk labels, and the explicit final result. Failed navigation/click/type actions fail visibly rather than reporting successful work. STOP cancels the in-flight provider request and pending approval/takeover gates.

The persisted budget remains in `data/call-budget.json`. Calls are reserved before provider requests; failures still count. HTTP 401/403/429 halt further calls. Existing unreadable or corrupt budget files fail closed. Do not reset the counter to bypass the cap.

## Switch

The host accepts Switch webhooks at `http://<host>:4100/webhook/switch` or `/api/switch/events`. In stream mode it also reads SSE from `/agents/<agent-id>/events`; set `SWITCH_EVENTS_PATH` if the installed Switch service uses a different relative route. Heartbeats run every two seconds and re-register after disconnection. Message posting falls back to `/agents/<agent-id>/message` when the room endpoint fails.

Incoming events must have `addressed:true`, text, sender name, and room ID. Event IDs are deduplicated across stream/webhook delivery. Approval commands accept `approve`, `@deskhand approve`, `not now`, or a matching `approve:<task-id>` / `reject:<task-id>`. Missing roles are viewers; stale task IDs and other-room approval messages cannot approve the current task. Persona roles remain a trusted-LAN hackathon convention, not authenticated identities.

## Tests

```sh
npm test                    # budget guard + isolated host/provider/Switch regressions
npm run test:integration    # real Chromium, mock-planner Chai Co. and Switch webhook flows
npm run test:generalized    # real Chromium with a local Azure-compatible fixture (no external calls)
npm run test:azure          # one real Azure connectivity request, charged to the persisted cap
```

Optional full live browser check (up to six real provider requests):

```sh
node --env-file=.env test-generalized-agent.js --azure-live
```

The fixture modes use disposable local pages and test credentials. They never test by posting to a real Switch room. Real Switch deployment/LAN configuration and physical iPhone permissions/Face ID/voice/Live Activities still need operator rehearsal.

## Verified in this checkout

- Upstream pulled through `22cba6d`; no unresolved merge conflicts.
- Full TypeScript build, 22 host regressions, six Swift cases, and iOS/widget simulator build passed.
- Real Chromium Chai Co. flows and Switch webhook/chat approval passed in mock-planner mode.
- Local SSE registration/event delivery and REST fallback passed against a local Switch fixture.
- Real Azure Responses/GPT-4o browser task passed in three model requests. Current persisted usage is **10/150**, including earlier diagnostic calls. No counter was reset.
- Credential scan found no Azure key in tracked diffs or untracked source files.
