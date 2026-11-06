# Deskhand — The Teammate That Uses the Computer for Your Team

> **Flip the Switch Hackathon Entry** • **Track 01: Best Business Workflow** • **MIT License**

Every team has chores stuck in web apps with no API: vendor portals, old admin panels, government and bank sites, or a staging app with a bug nobody can reproduce. Today one person does them by hand.

**Deskhand** is an AI teammate in Switch / Slack with **its own sandboxed computer** on Windows and a **native iOS Companion App** for voice tasks, 1-tap safety approvals, and live touch screen takeover.

---

## Monorepo Architecture

```text
deskhand/
├── packages/
│   └── shared-protocol/      # Frozen TypeScript & JSON contracts (Windows <-> Switch <-> iOS)
├── apps/
│   ├── chai-co-demos/        # Win-Dev 2: Chai Co. Staging Shop (/shop), Admin (/admin), Issue Tracker (/issues)
│   ├── agent-host/           # Win-Dev 1 & 2: Sandboxed Playwright Computer, Vision Loop, Safety Switch, Switch Client
│   └── windows-studio/       # Win-Dev 2: Windows Operator Dashboard, Live Viewport & Call Budget Monitor
├── ios/
│   └── DeskhandMobile/       # iOS-Dev 1 & 2: Swift 6 + SwiftUI iOS App (0-Call Voice STT, FaceID Approval, Touch Takeover)
├── data/
│   ├── call-budget.json      # Hard 150-call disk counter (halts at 150 or HTTP 401/403/429)
│   └── allowlist.json        # Strict allowed-sites list & approver role rules
├── WINDOWS_PRODUCT_PLAN.md   # Full Windows Product & 2-Dev Execution Plan
└── IOS_PRODUCT_PLAN.md       # Full iOS Product & 2-Dev Execution Plan
```

---

## Quickstart (Windows Host, Demo Suite & Desktop Studio)

1. **Install dependencies & build shared protocol:**
   ```powershell
   npm install
   npm run build
   ```

2. **Start the Chai Co. Demo App Suite (Port `4000`):**
   ```powershell
   npm run dev:demos
   ```
   - Staging Storefront (with `CHAI50` coupon bug): `http://localhost:4000/shop`
   - Store Admin Portal (`₹229 -> ₹249` + 2FA Gate): `http://localhost:4000/admin`
   - Engineering Issue Tracker: `http://localhost:4000/issues`

3. **Start the Deskhand Windows Agent Host & Switch Bridge (Port `4100`):**
   ```powershell
   npm run dev:host
   ```

4. **Start the Deskhand Studio for Windows UI (Port `4200`):**
   ```powershell
   npm run dev:studio
   ```
   Open `http://localhost:4200` to watch the live `1280x800` sandbox, trigger the 3 demo stories, approve/reject high-risk actions, or test the emergency Kill Switch (`Ctrl+Shift+K`).

5. **Check Hard Call Budget (`0 / 150`):**
   ```powershell
   npm run budget:status
   ```

---

## Quickstart (iOS Companion App — `ios/DeskhandMobile`)

1. Open `ios/DeskhandMobile/DeskhandMobile.xcodeproj` in **Xcode 16+** (iOS 18 SDK), choose the shared **DeskhandMobile** scheme, and Run. The package is a library/test harness.
2. Start in the labelled offline demo, or open **Host settings**, disable Offline demo, and enter `http://<windows-ip>:4100` on the same trusted LAN. See [iOS setup and verification](ios/DeskhandMobile/README.md).
3. Use the top **Persona Switcher Bar** (`👩‍💻 Priya (qa-lead)` | `📱 Arjun (ops-member)` | `🛡️ Rahul (admin)`) to test:
   - **Arjun's Hold-to-Talk Voice Note** (uses Apple on-device `SFSpeechRecognizer` so it consumes **0 API calls** from the 150-call cap).
   - **Priya's 1-Tap FaceID Approval Card** (`"Change Masala Chai from ₹229 to ₹249? Approve / Not now"`).
   - **Rahul's 2FA Login Code Takeover Sheet** (`482910` $\rightarrow$ **Type & Hand Back**).

---

## Product Plans for the 4-Developer Team

- **Windows Team (`Win-Dev 1` & `Win-Dev 2`):** See [WINDOWS_PRODUCT_PLAN.md](./WINDOWS_PRODUCT_PLAN.md)
- **iOS Team (`iOS-Dev 1` & `iOS-Dev 2`):** See [IOS_PRODUCT_PLAN.md](./IOS_PRODUCT_PLAN.md)


## Live Azure and Switch setup

See [live host setup](docs/LIVE_HOST_SETUP.md) for configuration validation, real Azure tests, Switch stream/webhook routes, and the preserved call budget.

## Current working architecture

Slack → Switch Console-managed Claude coordinator → `scripts/deskhand-room.js` → browser host. The host's `coordination.mode` is `console_managed`; `switchConnected: false` describes the unused direct legacy connection. The coordinator uses a restricted credential and cannot approve actions. Follow [coordinator instructions](docs/SWITCH_AGENT_INSTRUCTIONS.md) when configuring the existing Switch agent. Claude usage is separate from the host's persisted Azure call counter.

Studio is a cross-platform **web dashboard**, served locally at `http://localhost:4200`. A native Windows installer, tray app and system-wide hotkey are not implemented or Windows-device verified. Its keyboard shortcut works while the dashboard is focused.

For a physical iPhone: install the development app, connect to the same trusted Wi-Fi, open Host settings, turn Offline demo off, and enter the Mac/Windows host's LAN address on port 4100. In Studio choose **Pair iPhone operator**, then enter that single-use, five-minute code in the phone settings and Save. Live roles come from the host credential; persona switching is for the offline demo. Approval requires device authentication and a matching, unexpired action preview. This local demo uses HTTP on trusted LAN; remote deployment needs TLS and access controls.

`npm test` runs unit/regression checks. `npm run test:flows` runs isolated real-Chromium workflows with the mock planner and zero paid calls; `npm run test:generalized` checks the live planner protocol against a local provider fixture. Install Chromium first with `npx playwright install chromium`. `npm run test:switch` tests only the optional legacy connector, not the active Console architecture. `RECORD_DEMO=true npm run dev` records browser context video under ignored captures/videos; close the browser/host gracefully to finish video files.

Bug reports are built from observed page errors. “File it” retains its source task and room/thread context and returns a page-verified issue link. Price changes pause with an observed before/after diff; authenticated human approval is bound to that preview and expires after five minutes. A changed page blocks the pending save. Raw audio without an on-device transcript fails explicitly rather than inventing a task.
