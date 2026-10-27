# Echo

A shared listening room: create a room, invite friends, choose music, and hear it on every connected device.

## What works

- Room codes and shareable invite links, with named listeners and room chat.
- Anyone in the room can choose a track, play, pause, and seek for everyone. The host can turn off **Let everyone control music** to restrict playback controls to the host.
- **Make host** immediately hands hosting to another connected listener; the previous host becomes a listener. Only the current host can transfer hosting or change the shared controls setting.
- YouTube links (including Music, Shorts, and short links) and public direct HTTPS audio links. Audio formats depend on the device/browser; MP3 and WAV are good starting points. Spotify/Apple Music webpage URLs and DRM-protected content are not direct audio links.
- Each listener plays the selected source locally. Audio follows their operating system's selected output: built-in speakers, wired headphones, or connected Bluetooth. Volume is local to each device.
- Each listener taps **Enable audio** when prompted. Browser autoplay restrictions may require another tap after replacing a YouTube player. The host's **Play together** button also enables their own audio.
- Late joiners and reconnecting listeners catch up to the server's current track position. Clients estimate server clock offset and periodically correct playback drift.
- Hosting survives refreshes and brief disconnects. Leaving explicitly passes hosting immediately; unexpected disconnects allow a 15-second reconnection window before electing another connected listener.
- Session credentials are scoped to a room and verified by the server. Having an old host credential does not restore hosting after a transfer.

## Run locally

Requires Node 20.19+ (or a supported newer release).

```bash
npm ci
npm run server
```

In a second terminal:

```bash
npm run dev -- --host 0.0.0.0
```

Open `http://localhost:5173`. To test on phones on the same Wi-Fi, open `http://YOUR_COMPUTER_LAN_IP:5173` on each phone. Keep the backend running on port 3000; Vite proxies API and Socket.IO requests. Use separate browser profiles or devices for separate people. Refreshing a tab retains that person's session.

1. Create a room and copy its invite or share the room code.
2. Each friend joins with a name.
3. Any room member loads a YouTube link or a public direct audio-file URL.
4. Each listener enables audio; anyone presses **Play together**.
5. Anyone can pick the next song. Use **Make host** to hand host duties to another listener, or turn off shared controls to keep playback host-only.

Choose Bluetooth/headphones in each device's system audio settings. Keep the page open and the device awake while listening; background/locked mobile browsers can suspend media or network activity. This app plays selected links, not arbitrary audio from other apps or the host's entire system.

## Verification

The integration suite starts an isolated server on an unused port, connects real Socket.IO clients, and shuts it down automatically:

```bash
npm run test:integration
```

Browser tests start their own API and Vite servers on ports 3015 and 5175. They exercise separate browser sessions, actual decoded WAV playback, play/pause/seek, host transfer, shared controls, chat, refresh, network loss/reconnect, late joining, device-clock differences, media replacement, track restart, and a mobile viewport. A three-person scenario checks that a guest can load and start music before becoming host. The WAV response is supplied by the test with HTTP byte-range support; the YouTube error-path test substitutes its iframe API.

```bash
npx playwright install chromium
npm run test:e2e
npm run build
```

The reliability checks also cover temporary initial API failure, blocked browser storage, WebSocket failure with HTTP polling fallback, and host election after a long disconnection. Run the same suite in all three browser engines with:

```bash
npx playwright install chromium firefox webkit
ECHO_ALL_BROWSERS=1 npm run test:e2e
```

WebKit engine testing does not replace testing Safari on real Apple devices. When browser storage is blocked, the current tab retains its room session in memory; refreshing requires joining again. Temporary initial connection failures retry automatically.

To use an installed Chromium/Chrome executable instead of downloading the test browser:

```bash
ECHO_BROWSER_PATH='/path/to/chrome' npm run test:e2e
```

To verify a deployed frontend and its configured API, set `ECHO_LIVE_FRONTEND`.
These checks create temporary listening rooms on that service:

```bash
ECHO_LIVE_FRONTEND=https://your-echo-domain.example npm run test:e2e -- --grep 'a guest starts music'
```

The real YouTube check is opt-in because video availability and playback can
depend on the network, region, and YouTube's policies. It checks that unmuted
video elements play in two independent sessions, stay close in time, and pause
together:

```bash
ECHO_LIVE_YOUTUBE=1 ECHO_LIVE_FRONTEND=https://your-echo-domain.example npm run test:e2e -- --grep 'live YouTube audio'
```

Physical speakers, Bluetooth output latency, and device-specific background
playback still require checks on the target hardware.

## Deployment

The frontend and backend must both be updated together: this version uses registered participant sessions and a new playback command contract. Existing in-memory rooms expire when the backend restarts; create a fresh room after deploying.

### Existing Vercel frontend + Render API

The repository contains `vercel.json` and `render.yaml` for this layout. Set the frontend's public `VITE_API_URL` to the Render API's HTTPS URL at build time. Set the API's `CLIENT_ORIGIN` to the frontend origin (comma-separated if there are multiple).

```bash
VITE_API_URL=https://your-echo-api.onrender.com npm run build
```

The checked-in `.env.production` targets the project's existing Render backend. Local development uses the Vite proxy unless `VITE_API_URL` is explicitly set.

### One Node service

The Node service also serves a built frontend and handles room deep links. Build with an empty API URL to use the same origin:

```bash
VITE_API_URL='' npm run build
CLIENT_ORIGIN=https://your-echo-domain.example PORT=3000 npm start
```

Put the service behind HTTPS and allow WebSocket connections. `/health` is available for health checks. No deployment is performed by local builds or tests.

## Operational limits

Rooms, sessions, and the latest 100 chat messages are held in memory on one Node process. A server restart clears them; run one instance until room state and Socket.IO coordination are moved to shared storage. Empty rooms older than 24 hours are cleaned up. Rooms currently allow up to 500 issued participant sessions.

Synchronization is best effort, not sample-accurate speaker grouping. Network delays, buffering, YouTube ads, and different Bluetooth output latencies can introduce audible differences. Use **Resync my audio** if a device falls behind. YouTube may restrict embedding or playback by region/account; the player shows errors so the host can choose another track. Real Bluetooth output and device-specific autoplay/background behavior require testing on the target hardware.

## Structure

- `src/App.jsx`: landing page, create/join forms, and navigation.
- `src/LiveRoom.jsx`: room controls, listener roster, invites, and chat.
- `src/useRoom.js`: authenticated socket session, reconnect, clock estimation, and room snapshots.
- `src/SyncedPlayer.jsx`: YouTube/native audio players, audio activation, drift correction, local volume, and shared seeking.
- `src/session.js`: session storage, media URL parsing, and timeline helpers.
- `server/index.js`: room authority, participant authentication, host transfer/election, and playback timeline.
- `scripts/integration-check.mjs`, `tests/rooms.spec.js`: integration and browser verification.
