# ADR-031 Durable AI Mentor Memory

## Status

Accepted

## Context

The mentor already extracted insights, preferences, and conversation summaries, but they only lived in process memory. That meant the mentor lost its long-term context on restart and could not reliably retain goals or preferences across sessions.

## Decision

- Keep the existing in-memory memory layer for low-latency prompt assembly
- Add a Firestore-backed durable mentor memory store under `users/{uid}/mentorMemory`
- Hydrate persistent memory before running mentor prompts
- Persist new insights, summaries, preferences, and business goals after each mentor response
- Fix the mentor client to send a stable `threadId`

## Consequences

- Mentor memory now survives deploys and server restarts
- Prompt context is more consistent because the same thread can be rehydrated
- Firestore write volume increases, but the writes are small and append-friendly
- The design stays compatible with future vector search or managed memory backends

