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

# ── 2. Verify backend connectivity ─────────────────────────────────────
echo ""
echo "🔗  Checking backend connectivity..."
HTTP_STATUS=$(curl -o /dev/null -s -w "%{http_code}" --max-time 8 "$BACKEND_URL/health" 2>/dev/null || echo "000")

if [ "$HTTP_STATUS" = "000" ]; then
  echo "⚠️  WARNING: Backend did not respond at $BACKEND_URL/health"
else
  echo "✅  Backend responded (HTTP $HTTP_STATUS)."
fi

# ── 3. Write .env ─────────────────────────────────────────────────────
echo ""
echo "📝  Writing .env..."
cat > .env << EOF
EXPO_PUBLIC_API_URL=${BACKEND_URL}
EOF

echo "✅  .env created"

# ── 4. Install dependencies ────────────────────────────────────────────────
echo ""
echo "📦 Installing dependencies..."
pnpm install
echo "✅ Dependencies installed."

# ── 5. Clean old processes ────────────────────────────────────────────────
echo ""
echo "🧹 Cleaning previous processes..."

pkill -f "expo start" 2>/dev/null || true
pkill -f "metro" 2>/dev/null || true
sleep 2

# ── 6. Expo Tunnel Startup (FIXED) ────────────────────────────────────────
echo ""
echo "🚀 Starting Expo (stable tunnel mode)..."
echo ""

export EXPO_USE_FAST_RESOLVER=1
export EXPO_DEBUG=1
export EXPO_NO_TELEMETRY=1
export NODE_OPTIONS=--max_old_space_size=4096

exec pnpm exec expo start --tunnel --clear