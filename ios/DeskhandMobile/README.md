# Deskhand for iOS

Open `DeskhandMobile.xcodeproj`, select the shared **DeskhandMobile** scheme and an iPhone simulator, and Run. The Swift package is a library and regression test harness, not an installable iOS app.

The app starts in **Offline demo**. Expand **Start a Chai Co. task** to rehearse checkout reproduction, price approval, or 2FA takeover. Switch personas to Priya/Rahul for approvals and Rahul for bug filing. Every simulated action is labelled. Live authentication is never bypassed by a simulator check.

In **Host settings**, turn off Offline demo and enter `http://<windows-LAN-IP>:4100`. The host and iPhone must share a trusted LAN. Grant local network permission. The simulator can use `http://localhost:4100` when the host runs on the same Mac.

From the repository root:

```sh
npm ci
npm run build
npx playwright install chromium
npm run dev:demos
npm run dev:host
```

Voice requires microphone and speech permissions, an available on-device English (India) speech model, and a physical-device rehearsal. Tap the mic to start/stop or hold it, then review/edit the transcript and Send. Unavailable recognition shows an error; it never invents a command. The original M4A voice note uploads with the transcript and is playable in the timeline. STT remains on device.

Live approval uses Face ID with device-passcode fallback. Authentication cancellation/failure sends no approval. The active role must be in the approval's `allowedRoles`; the host checks roles again. Demo personas are a hackathon convenience, not authenticated identities.

Takeover displays host JPEG frames, supports pinch zoom, pan, tap, remote text, six-digit OTP, and explicit hand-back. If Chromium/frames are unavailable, use the quick-code field. Frames are throttled to at most 15 fps; CDP emits on browser changes rather than a fixed cadence. The host rejects takeover input for tasks that are not paused for takeover.

## Validation

```sh
swift test --package-path ios/DeskhandMobile
xcodebuild -project ios/DeskhandMobile/DeskhandMobile.xcodeproj \
  -scheme DeskhandMobile -sdk iphonesimulator \
  -derivedDataPath /tmp/deskhand-derived CODE_SIGNING_ALLOWED=NO build
npm run build
npm test
```

The package tests cover gateway snapshots/events, forbidden HTTP responses, host validation, touch mapping, role enforcement, and mock scenarios.

## Device checklist

- Choose your Apple development team in Signing & Capabilities before deploying to an iPhone.
- Test deny/allow microphone and speech permissions, unavailable on-device recognition, and real speech.
- Confirm an Arjun voice task reaches the host with zero STT calls.
- Cancel Face ID, then approve with Priya; verify Save occurs only after successful authentication.
- Reject another approval; verify the page remains unchanged.
- Enter a fresh OTP, test zoomed taps and hand-back, and test STOP while paused.
- Disconnect/reconnect Wi-Fi; the feed should restore from the host snapshot.

## Scope and limits

The host uses LAN HTTP/WS for the hackathon, so the app permits cleartext transport. Use only on a trusted network. Authenticated pairing, TLS, APNs, hardware-signed approvals, iPad fleet supervision, and TestFlight distribution remain the product plan's post-hackathon roadmap. Device speech/Face ID, physical Windows integration, and video recording require device/operator verification. The host generates looping GIFs from real PNG captures and uses an SVG summary only when Chromium is unavailable. Lock Screen and Dynamic Island Live Activities show task progress; allow Live Activities in iOS Settings.

## Prepared device build

A development-signed package is available locally at `build/DeskhandMobile-Development.ipa`, with its archive at `build/DeskhandMobile-Development.xcarchive`. Both are ignored build artifacts. App and widget signatures were verified. The paired iPhone must be unlocked and connected by cable or reachable on the same LAN before installation:

```sh
xcrun devicectl device install app --device YOUR_DEVICE_ID \
  build/DeskhandMobile-Development.xcarchive/Products/Applications/DeskhandMobile.app
```

The optional `Configuration/LocalSigning.xcconfig` keeps each developer's team configuration out of source control. `ios/scripts/sign_archive.py` can package an already-built archive using an existing development identity/profile; it does not create credentials or publish to TestFlight.
