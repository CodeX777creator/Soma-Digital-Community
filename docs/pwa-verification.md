# PWA Verification Checklist

Run the static validation before deployment:

```bash
npm run test:pwa
npm run typecheck
```

## Browser Matrix

Test the production URL on Chrome Android, Chrome desktop, Edge desktop, Safari iPhone, Safari iPad, and Firefox desktop.

- Chromium browsers show the install prompt only when installation is supported.
- iOS Safari shows the Share → Add to Home Screen instructions.
- Installed mode does not show the install prompt again.
- The public launch URL opens the welcome page for signed-out users.
- Authenticated users reach `/dashboard`; unfinished users reach `/open`.
- Notification shortcuts preserve safe internal paths.
- Offline navigation shows the branded offline page.
- No dashboard, billing, course, marketplace, Firebase, API, or personalized RSC response is served from Cache Storage.
- “Update now” activates the waiting worker and reloads once.
- “Later” keeps the current worker active.
- Logout removes the web push token before the Firebase session ends.

## Production Checks

Confirm the deployed responses have these properties:

| URL | Expected |
| --- | --- |
| `/manifest.json` | `200`, manifest JSON content type, revalidation allowed |
| `/sw.js` | `200`, JavaScript content type, `no-cache` and `no-store` |
| `/icon-192x192.png` | `200`, immutable public cache |
| `/icon-512x512.png` | `200`, immutable public cache |
| `/api/*` | `no-store` |

Inspect the browser Application panel for the manifest, active service worker, Cache Storage, and push subscription. Run Lighthouse's PWA checks after every production service-worker version change.
