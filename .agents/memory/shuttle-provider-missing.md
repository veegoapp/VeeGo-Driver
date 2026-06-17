---
name: ShuttleProvider missing bug
description: Root cause of shuttle routes not showing — ShuttleProvider was never mounted in the app
---

## Rule
`ShuttleProvider` MUST be the outermost wrapper in `app/(shuttle)/_layout.tsx`.

## Why
`ShuttleContext` is created with default values (`routes: []`, etc.). Without `ShuttleProvider` wrapping the shuttle screens, every call to `useShuttle()` returns those empty defaults — no API calls are made, no routes are fetched, everything shows empty.

## How to apply
If shuttle screens show empty data despite a healthy backend, check that `ShuttleProvider` is imported and wrapping `ShuttleLayoutContent` in `app/(shuttle)/_layout.tsx`. It requires `QueryClientProvider` and `SocketProvider` as ancestors (both already in `app/_layout.tsx`).
