# iOS implementation status — November 6, 2026

The hackathon companion implementation is in `ios/DeskhandMobile`, with the mobile gateway integration in `apps/agent-host`. Open the Xcode project rather than the library package.

Implemented:

- Installable iOS 18 / Swift 6 app target, shared scheme, iPad device support, usage descriptions and local-network transport configuration.
- Observable feed state, task history, snapshot restoration, cancellation-aware WebSocket reconnection with bounded backoff, visible errors, persisted host settings.
- Three deterministic offline demo scenarios with delayed steps, role switching, approvals, rejection, takeover and STOP. Demo actions are labelled and make no network requests.
- On-device speech permission and availability checks, hold-to-talk and accessible tap recording, live transcript and microphone meter, editable transcript review, M4A attachment upload and playback. Empty speech never creates a task.
- Approval target/diff/screenshot, host-provided role restrictions, Face ID/passcode authentication with fail-closed behavior, duplicate-submit guard and persona-change invalidation.
- Live CDP JPEG frames, throttled delivery, slow-client backpressure guard, cached frame on reconnect, zoom/pan/tap mapping, native text and OTP input, explicit hand-back and static fallback.
- Server-side validation of approval decisions, active takeover task, coordinates, OTP and input size; rejection of overlapping browser tasks; emergency-stop cancellation of pending human gates.
- Auto-following screenshot carousel, critical bug report and admin filing action, animated GIF replays from real captures, voice note playback.
- Embedded WidgetKit extension and ActivityKit updates for Lock Screen / Dynamic Island progress and approval-needed state.
- Reproducible Xcode project generator at `ios/scripts/generate_xcode_project.py`.

Verification performed:

- Full monorepo `npm run build`: passed.
- `npm test`: 22 host, Azure-provider, Switch stream, safety, budget persistence, and mobile gateway regression tests passed. See LIVE_HOST_SETUP.md for current commands.
- `swift test --package-path ios/DeskhandMobile`: seven Swift Testing cases passed.
- iOS simulator build with Swift 6 strict concurrency: app and widget extension passed.
- Installed/launched app in iPhone 18 Pro simulator; inspected initial layout.
- Real headless Chromium with local Chai Co. demos, deterministic planner and disconnected Switch: verified price remains 229 before approval, unauthorized approval returns 403, authorized approval changes price to 249, three real PNG steps and GIF response, two takeover frames and successful OTP hand-back, checkout bug report, zero model calls.

Remaining operator/external work:

- Physical iPhone microphone/on-device speech model, audio attachment fidelity, Face ID/passcode cancellation and approval, local-network permission, and Lock Screen/Dynamic Island rehearsal.
- Physical Windows host/LAN and real Switch integration. Local integration used the actual browser/gateway with Switch disconnected and the deterministic planner; the separate real Azure browser test now verifies live planning, but the installed Switch service and physical Windows/LAN remain unverified.
- Device deployment, demo video capture/editing, submission and publishing/merging. An existing signing identity/profile is configured locally, and a signed development IPA/archive is prepared. No remote commit, PR, or publication was performed.
- Production roadmap from section 7 of IOS_PRODUCT_PLAN.md: APNs/QR pairing, Secure Enclave signing, TestFlight, fleet supervision and WebRTC. These are not part of the implemented hackathon demo.

Latest host reconciliation: Azure planning now uses current screenshots/DOM and validated provider output; live errors never run deterministic fallback actions. Switch SSE, reconnect, deduplication and REST fallback are implemented alongside webhooks. See [live setup](LIVE_HOST_SETUP.md). Demo personas are not authenticated user accounts; the host remains a trusted-LAN hackathon service.

Latest verification: real Azure GPT-4o completed the local browser task in three requests using screenshots/DOM and an explicit final result. The persisted total is 10/150, including connectivity and diagnostic attempts. All Chai Co. stories, issue filing, 2FA, RBAC, and Switch chat approval passed against the local host.


Final device packaging:

- Added full-screen screenshot inspection with pinch zoom and pan.
- Failed task sends retain the draft and original voice attachment for retry.
- Active task snapshots restore Live Activity state after reconnect.
- Unsigned release archive: `build/DeskhandMobile.xcarchive` (device archive succeeded).
- Signed development archive: `build/DeskhandMobile-Development.xcarchive`.
- Signed development IPA: `build/DeskhandMobile-Development.ipa`; app and widget signatures verified.
- Signing uses existing development credentials only. Team-specific settings remain in ignored `Configuration/LocalSigning.xcconfig`.
- Physical installation was attempted; CoreDevice error 4016 reports trusted device connectivity unavailable. Unlock and connect the paired iPhone by cable or the same LAN, then install the prepared app. No microphone recording or approval actions were started on the physical device.
- `npm run readiness` checks local services, Azure configuration, call budget, Switch connection, and IPA availability without making model requests.
