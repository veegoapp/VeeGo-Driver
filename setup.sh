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
  echo ""
  exit 1
fi

echo "✅  BACKEND_URL found."

# ── 2. Write .env file ─────────────────────────────────────────────────────
cat > .env << EOF
EXPO_PUBLIC_API_URL=${BACKEND_URL}
EOF

echo "✅  .env written (EXPO_PUBLIC_API_URL=${BACKEND_URL})"

# ── 3. Install dependencies ────────────────────────────────────────────────
echo ""
echo "📦  Installing dependencies..."
pnpm install
echo "✅  Dependencies installed."

# ── 4. Start Expo ─────────────────────────────────────────────────────────
echo ""
echo "🚀  Starting Expo..."
echo ""

exec npx expo start --tunnel --clear
