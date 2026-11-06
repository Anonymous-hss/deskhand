# Local setup and active architecture

```sh
npm ci
npx playwright install chromium
npm run build
npm run config:check
npm run dev
```

Copy `.env.example` to ignored `.env` and set the Azure endpoint/key/deployment for live mode. Resource roots, v1 bases and full Responses URLs are accepted. Mock mode is explicit and never silently replaces a failed live call. Keep credentials out of source and model instructions.

The active architecture is Slack → Switch Console-managed Claude agent → restricted `scripts/deskhand-room.js` CLI → browser host. Configure the existing agent with [these instructions](SWITCH_AGENT_INSTRUCTIONS.md). The host reports `coordination.mode: console_managed`; its `switchConnected: false` describes the unused direct legacy client. This does not prove or disprove Slack delivery. `lastAgentContactAt` is the last authenticated bridge request, not an independent Switch connection heartbeat. Claude coordinator usage is separate from the host Azure budget.

Studio is loopback-only at `http://localhost:4200` and injects its operator credential on its server-side host proxy. The CLI uses a restricted coordinator credential. Both are generated in ignored `.deskhand/client-credentials.json`, never embedded in HTML. The coordinator cannot approve or control takeover. The WebSocket is a read-only feed; authenticated REST carries operator mutations. The legacy stream/webhook implementation is opt-in with `SWITCH_TRANSPORT=direct_legacy`; it is not the active installed Console protocol and is not a verified production integration.

On a physical iPhone, use the host's LAN address on port 4100. In Studio choose **Pair iPhone operator**. Turn Offline demo off in phone settings, enter the address and single-use five-minute code, then Save. The token is scoped to this host in Keychain. Leave the code blank on later saves. Live roles come from the host, not persona claims. Approvals require a matching unexpired approval ID and unchanged page preview; Face ID/passcode is enforced by the app. Local HTTP and public read-only task/capture feeds are for a trusted-LAN demo; remote deployment requires TLS and stronger access controls.

Screenshots and page context go to the configured Azure deployment. Only the known disposable loopback demo form fields expose their current values/options in DOM context; this is not enabled for arbitrary sites. Provider output is schema-constrained and runtime-validated. Incomplete/invalid results fail visibly. STOP cancels pending provider and human gates. Observed errors survive planner failures. Final saved prices and issue links are verified from the actual page.

The 150-call cap persists in `data/call-budget.json`. Failed provider attempts count; 401/403/429 halt further requests. Corrupt budget state fails closed. Never reset this file to bypass the cap. Tests use isolated temporary budget/state files.

```sh
npm test                   # unit/provider/security regressions
npm run test:integration   # isolated Chromium workflows and local model fixture; no paid calls
swift test --package-path ios/DeskhandMobile
npm run readiness          # local configuration/service checks; no model requests
RECORD_DEMO=true npm run dev # browser videos in ignored captures/videos; close host to finalize
```

`npm run test:switch` exercises only the legacy connector fixture. `npm run test:azure` makes a charged provider request; it is not required for the offline checks. For real Slack evidence and remaining device/Windows limits, see [verification status](IOS_IMPLEMENTATION_STATUS.md).
