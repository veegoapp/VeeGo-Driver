---
name: Backend URL wiring
description: How BACKEND_URL secret flows into the app and what can go wrong at login
---

The preferred source of truth is the `EXPO_PUBLIC_API_URL` Replit secret; `BACKEND_URL` remains supported as a legacy fallback.

**Flow:**
1. `setup.sh` reads `$EXPO_PUBLIC_API_URL`, then falls back to `$BACKEND_URL`
2. Pings the selected backend `/health` endpoint with an 8-second timeout; warns but continues if unreachable
3. Writes `.env` → `EXPO_PUBLIC_API_URL=<selected backend URL>`
4. Runs `pnpm install` then `pnpm exec expo start --tunnel --clear`
5. Metro bakes `EXPO_PUBLIC_API_URL` into the bundle at startup

**Why `pnpm exec expo start` not `npx expo start`:**
`npx` may resolve a different version of `expo` than the locally installed `@expo/cli@54.x`, causing version-mismatch warnings or subtle bundler differences. Always use `pnpm exec expo start`.

**Why `--clear` is required:**
`EXPO_PUBLIC_*` vars are baked in at Metro bundle time. Without `--clear`, stale cache may serve the old URL even after `.env` changes.

**Environment caveat:**
Changing the `BACKEND_URL` secret does not update an already-running Expo bundle. The setup workflow must run again so it rewrites `.env` and restarts Metro; an older `npx expo start` process can occupy port 8081 and leave the workflow waiting for an interactive port choice.

**Why:** The app can show the offline banner while the backend is healthy if the bundle still contains the fallback `localhost:3000/api` URL, which a phone/emulator cannot reach as the backend.

**How to apply:** After changing `BACKEND_URL`, stop stale Expo/Metro processes, run `bash scripts/setup.sh`, and confirm the resulting `.env` points to the backend before opening the app.

**Socket URL derivation:**
`hooks/useRideSocket.ts` and `lib/serviceControlContext.tsx` both strip the trailing `/api` segment from `EXPO_PUBLIC_API_URL` to get the WebSocket root. If `BACKEND_URL` does not end with `/api`, the socket will connect to the wrong host.

**"Cannot reach the server" on login means:**
- `ApiError(status=0)` — network-level failure (DNS, refused connection, timeout)
- Most common cause: the backend repl is asleep or `BACKEND_URL` points to the wrong host
- Check the `⚠️ WARNING` line in `setup.sh` output — if health ping failed, the backend isn't up
