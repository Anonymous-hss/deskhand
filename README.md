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

1. Open `ios/DeskhandMobile/Package.swift` in **Xcode 16+** (iOS 18 SDK).
2. Run on iPhone Simulator or physical iPhone connected to the same LAN as the Windows Host (`ws://<windows-ip>:4100/ws`).
3. Use the top **Persona Switcher Bar** (`👩‍💻 Priya (qa-lead)` | `📱 Arjun (ops-member)` | `🛡️ Rahul (admin)`) to test:
   - **Arjun's Hold-to-Talk Voice Note** (uses Apple on-device `SFSpeechRecognizer` so it consumes **0 API calls** from the 150-call cap).
   - **Priya's 1-Tap FaceID Approval Card** (`"Change Masala Chai from ₹229 to ₹249? Approve / Not now"`).
   - **Rahul's 2FA Login Code Takeover Sheet** (`482910` $\rightarrow$ **Type & Hand Back**).

---

## Product Plans for the 4-Developer Team

- **Windows Team (`Win-Dev 1` & `Win-Dev 2`):** See [WINDOWS_PRODUCT_PLAN.md](./WINDOWS_PRODUCT_PLAN.md)
- **iOS Team (`iOS-Dev 1` & `iOS-Dev 2`):** See [IOS_PRODUCT_PLAN.md](./IOS_PRODUCT_PLAN.md)

