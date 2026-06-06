---
name: Backend URL wiring
description: How BACKEND_URL secret flows into the app and what can go wrong at login
---

The single source of truth is the `BACKEND_URL` Replit secret.

**Flow:**
1. `setup.sh` reads `$BACKEND_URL` (exits if unset)
2. Pings `$BACKEND_URL/health` with an 8-second timeout; warns but continues if unreachable
3. Writes `.env` → `EXPO_PUBLIC_API_URL=$BACKEND_URL`
4. Runs `pnpm install` then `pnpm exec expo start --tunnel --clear`
5. Metro bakes `EXPO_PUBLIC_API_URL` into the bundle at startup

**Why `pnpm exec expo start` not `npx expo start`:**
`npx` may resolve a different version of `expo` than the locally installed `@expo/cli@54.x`, causing version-mismatch warnings or subtle bundler differences. Always use `pnpm exec expo start`.

**Why `--clear` is required:**
`EXPO_PUBLIC_*` vars are baked in at Metro bundle time. Without `--clear`, stale cache may serve the old URL even after `.env` changes.

**Socket URL derivation:**
`hooks/useRideSocket.ts` strips the trailing `/api` segment from `EXPO_PUBLIC_API_URL` to get the WebSocket root. If `BACKEND_URL` does not end with `/api`, the socket will connect to the wrong host.

**"Cannot reach the server" on login means:**
- `ApiError(status=0)` — network-level failure (DNS, refused connection, timeout)
- Most common cause: the backend repl is asleep or `BACKEND_URL` points to the wrong host
- Check the `⚠️ WARNING` line in `setup.sh` output — if health ping failed, the backend isn't up
