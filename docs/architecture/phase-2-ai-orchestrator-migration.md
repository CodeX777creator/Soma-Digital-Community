# Phase 2 Migration Notes

## What Changed

* Added a task-based AI orchestrator in `src/ai/platform/orchestrator.ts`
* Added prompt assembly helpers that reuse the existing prompt-builder templates
* Routed content generation through the orchestrator
* Routed roadmap generation through the orchestrator
* Routed strategic advice generation through the orchestrator
* Extended the platform layer to understand quality modes and task-level policy

## Routing Behavior

* Business coaching tasks favor GPT-class models
* Sales/content tasks favor Claude-class models
* Translation tasks favor Gemini-class models
* The orchestrator prefers Vercel AI Gateway when configured
* Direct OpenAI-compatible providers remain available as fallback paths

## Backwards Compatibility

The public API surfaces did not change.
Existing feature routes still return the same shapes.

## Next Migration Steps

* Add durable provider metrics
* Persist orchestration outcomes in Firestore
* Add image, video, and voice execution modules
* Introduce prompt version metadata into generated assets

