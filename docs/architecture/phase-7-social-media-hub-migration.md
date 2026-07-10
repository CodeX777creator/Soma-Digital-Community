# Phase 7 Migration Notes: Social Media Hub

## What changed

- Added a dedicated social hub domain under `src/social`
- Added a protected social account management API at `/api/social/accounts`
- Added encrypted OAuth credential storage using an application master key
- Added a social hub UI at `/social`
- Added provider metadata for TikTok, Instagram, Facebook, LinkedIn, X, and YouTube
- Added Firestore rules coverage for `socialAccounts`
- Added the social hub link to the main application navigation

## Social hub capabilities

- Connect multiple social providers
- Store account metadata and encrypted credentials
- List connected, pending, expired, and disconnected accounts
- Track provider coverage and account counts
- Preserve a clean handoff point for phase 8 scheduling and phase 9 publishing

## Data model notes

- `socialAccounts` is the canonical owner collection
- Token material is encrypted before it reaches Firestore
- The API returns only safe, non-sensitive account metadata
- Disconnecting an account clears credentials and keeps the record for auditability

## Compatibility notes

- The social hub is additive and does not interfere with AI studios or billing
- Writes are performed through server routes, not directly from the client
- The Firestore rule set blocks client-side writes to the social account collection

## Environment variables

- `SOCIAL_CREDENTIALS_MASTER_KEY`

## Follow-up recommendations

- Add OAuth callback routes for provider-specific handshakes in a later phase
- Add provider token refresh jobs once scheduling begins
- Add scheduled post and campaign editors in phase 8
