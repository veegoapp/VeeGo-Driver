#!/usr/bin/env bash
set -e

echo ""
echo "=========================================="
echo "  VeeGo Driver App — Setup"
echo "=========================================="
echo ""

# ── 1. Check required secrets ──────────────────────────────────────────────
if [ -z "$BACKEND_URL" ]; then
  echo "❌  ERROR: BACKEND_URL secret is not set."
  echo "    Go to Replit Secrets and add BACKEND_URL with your backend server URL."
  echo "    Example: https://your-backend.replit.app/api"
  echo ""
  exit 1
fi

echo "✅  BACKEND_URL found: $BACKEND_URL"

# ── 2. Verify the backend is reachable ─────────────────────────────────────
echo ""
echo "🔗  Checking backend connectivity..."
HTTP_STATUS=$(curl -o /dev/null -s -w "%{http_code}" --max-time 8 "$BACKEND_URL/health" 2>/dev/null || echo "000")
if [ "$HTTP_STATUS" = "000" ]; then
  echo "⚠️   WARNING: Backend did not respond at $BACKEND_URL/health"
  echo "    The app will start but login will fail until the backend is running."
else
  echo "✅  Backend responded (HTTP $HTTP_STATUS)."
fi

# ── 3. Write .env file ─────────────────────────────────────────────────────
echo ""
echo "📝  Writing .env..."
cat > .env << EOF
EXPO_PUBLIC_API_URL=${BACKEND_URL}
EOF
echo "✅  EXPO_PUBLIC_API_URL=${BACKEND_URL}"

# ── 4. Install dependencies ────────────────────────────────────────────────
echo ""
echo "📦  Installing dependencies..."
pnpm install
echo "✅  Dependencies installed."

# ── 5. Start Expo (tunnel, clean cache) ────────────────────────────────────
echo ""
echo "🚀  Starting Expo (tunnel + clear cache)..."
echo ""

# Kill any lingering Metro / Expo processes so port 8081 is free
pkill -f "expo start" 2>/dev/null || true
pkill -f "metro"      2>/dev/null || true
sleep 1

EXPO_DEBUG=1 EXPO_USE_FAST_RESOLVER=1 exec pnpm exec expo start --tunnel --clear