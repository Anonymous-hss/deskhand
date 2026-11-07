# Flip the Switch Hackathon Submission

The [official challenge](https://www.wemakedevs.org/hackathons/switch) asks for an AI agent and people to finish a real task together in team chat through Switch. Judges evaluate Switch usage, technical reproducibility, impact, and presentation. Deskhand targets Track 01, Best Business Workflow.

## Entry details

- **Project:** Deskhand
- **Track:** Track 01 — Best Business Workflow
- **Repository:** <https://github.com/Anonymous-hss/deskhand>
- **Demo video:** [`submission/deskhand-demo.mp4`](../submission/deskhand-demo.mp4)

## Project summary

Deskhand gives a team chat agent a sandboxed browser so it can investigate web-app problems and make controlled changes with a person in the loop. A teammate asks in Slack; Switch routes the request to Deskhand's coordinator, which uses a restricted local command bridge to the browser host. Deskhand returns observed evidence and verified results to the originating conversation. Before a risky price save, the run pauses for a person to approve from the paired iPhone.

The submission demonstrates two complete workflows against a local Chai Co. demo suite:

1. **Checkout bug:** reproduce the `CHAI50` checkout error, retain the actual browser evidence, wait for “file it,” create an issue, verify the saved issue page, and return its link to the Slack thread.
2. **Price update:** change Masala Chai from ₹229 to ₹249, pause before saving, authenticate and approve on the paired iPhone, verify the saved page value, and confirm the result in the Slack thread.

Switch is part of the live workflow: Slack requests reach the Switch-managed coordinator and replies return to their originating threads. The coordinator's local bridge is restricted and cannot approve risky actions. The host binds approval to the observed price diff and page state. This project uses Switch Console's managed agent path; the optional direct legacy Switch connector is not the active path.

## Reproduce from a clean clone

Requirements: Node.js 20+, Docker and Switch Console for the live chat route, and Chromium for browser runs. A live model run also needs a locally configured Azure OpenAI endpoint and key; never put credentials in the repository or video.

```sh
git clone https://github.com/Anonymous-hss/deskhand.git
cd deskhand
npm ci
npx playwright install chromium
npm run build
```

For the local, zero-paid-call demo, copy `.env.example` to `.env`, set `VISION_MODE=mock`, and start the demo suite and host:

```sh
npm run dev:demos
npm run dev:host
```

Open <http://localhost:4000/shop>, <http://localhost:4000/admin>, and <http://localhost:4000/issues>. To connect Slack, follow [live host setup](LIVE_HOST_SETUP.md) and [Switch coordinator instructions](SWITCH_AGENT_INSTRUCTIONS.md). Run `npm run readiness` to inspect local service configuration without making an Azure call. The source `data/call-budget.json` is the hard 150-call host budget; tests use isolated temporary budgets.

## Verification evidence

- `npm test`: TypeScript workspace builds, call-budget guard and 31 host regression tests.
- `npm run test:integration`: isolated Chromium workflow tests and local provider fixture; no paid model call.
- `swift test --package-path ios/DeskhandMobile`: seven iOS package tests.
- `docs/IOS_IMPLEMENTATION_STATUS.md`: recorded Slack workflow evidence, physical iPhone approval, device verification limits, and Windows status.

The 36-second video combines a browser capture from the refreshed, repeatable local fixture with replay GIFs from the verified live browser tasks. The live Slack thread and iPhone approval were verified separately; neither the Slack UI nor the phone/Face ID screen is filmed. The video labels this limit instead of presenting a mock approval as a live one.

## Scope and limits

The Chai Co. shop is a workflow fixture, not a live store: it does not take payment, and price/issue state is in memory. The iOS app is a development build, not a TestFlight release. The Windows Studio is currently a cross-platform local web dashboard; a native Windows installer/tray/global hotkey and Windows-device validation are not complete. Physical iPhone speech, takeover, and Lock Screen behavior still need operator/device verification. The live host uses trusted-LAN HTTP/WS, not production TLS. These limits are documented so the demo makes no production-readiness claims.

The WeMakeDevs submission form requires an entrant account sign-in. The source, README, and video are prepared in the public repository; final form submission must be completed by the entrant while signed in.
