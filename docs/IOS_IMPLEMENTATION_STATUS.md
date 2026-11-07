# Deskhand verification — 7 November 2026

The iOS 18 / Swift 6 app and widget build, and the signed development app is installed and launched on the paired iPhone 17. Open the Xcode project under `ios/DeskhandMobile`, not the library package, to run the app.

Implemented: live task feed and reconnect restoration; screenshots and replay; on-device speech with editable transcript and original M4A; server-defined paired operator identity in Keychain; Face ID/passcode approval; expiring approval IDs, actual before/after diff and page fingerprint; live takeover with zoom, coordinate mapping, text/OTP controls; STOP; offline demo personas; ActivityKit/WidgetKit targets.

Verified:

- 31 host/provider/security regression tests and seven Swift tests pass.
- Isolated Chromium workflows verify actual checkout error → report → created issue link, and price pause → restricted/stale approval rejection → authenticated approval → verified saved price. These use the mock planner and no paid calls.
- A separate real Chromium/provider-fixture test verifies generalized screenshot/DOM planning without paid calls.
- Real Slack/Switch/Azure checkout reproduction captured the actual HTTP 500 CouponDiscountOverflowException and posted its screenshot in Slack. A failed model completion preserves that evidence.
- The original “file it” request was retried during development after provider and form-context failures. The final live task `task-403a9caf-38a9-4c94-a824-48b85153c2f0` verified issue CHAI-104 at `http://localhost:4000/issues/CHAI-104`. Developer initiated the final retry through the same restricted CLI, retaining the original room/thread/report IDs.
- Real Slack price task `task-b6084bd2-494d-4950-924b-b6b7c15834ea` paused for the actual Save click. The paired physical iPhone operator approved; the user confirmed Face ID/passcode. The host executed Save, verified ₹249 on the saved page, and the coordinator confirmed it with evidence in the Slack thread.
- Source clean-clone install and integration checks pass; see the local verification artifacts and current commit history.

Recordings under ignored `build/demo-evidence` show the browser runs, including the price pause and resumed Save. The public 36-second submission video pairs the refreshed local fixture with those verified browser outcomes; it does not film the Slack UI, physical iPhone, or biometric prompt. Earlier failed runs are retained rather than presented as successes.

Still unverified or unfinished: physical iPhone microphone/on-device speech availability and audio fidelity, approval cancellation, physical touch/OTP takeover, Lock Screen/Dynamic Island behavior; Windows hardware operation and a native Windows installer/tray/global shortcut; production TLS, APNs, Secure Enclave-signed approval assertions, QR enrollment, TestFlight/fleet supervision and WebRTC. Studio is currently a cross-platform web dashboard. The public source push and signed-in WeMakeDevs form submission status are recorded in the repository README and submission brief.
