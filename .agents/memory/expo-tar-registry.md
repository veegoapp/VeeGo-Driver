---
name: Expo tar registry workaround
description: Environment-specific pnpm workaround for Expo CLI's tar dependency
---

Expo CLI 54 requests `tar` through a range that initially resolved to `7.5.2`, but the Replit package firewall returned HTTP 403 for that tarball. Pinning `tar` to `7.5.21` in the workspace overrides allows installation while preserving the workspace's 24-hour minimum release-age protection.

**Why:** The latest `7.5.22` was too new for the release-age policy on July 24, 2026, while `7.5.21` was old enough and remained within Expo CLI's `^7.5.2` range.

**How to apply:** If dependency setup again fails on Expo CLI's `tar` tarball, inspect the current firewall/release-age status before changing the pin; do not disable `minimumReleaseAge`.