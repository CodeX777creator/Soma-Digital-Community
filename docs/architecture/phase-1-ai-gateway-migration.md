# Phase 1 Migration Notes

## What Changed

* Added a centralized AI platform layer under `src/ai/platform`
* Moved provider/client resolution behind the platform layer
* Routed Genkit model execution through the platform layer
* Replaced direct client usage in the enhanced mentor flow
* Fixed token budgeting so it uses prompt text instead of the length of a number
* Added environment variables for AI gateway configuration

## Backwards Compatibility

Current text-generation features still work with the existing Moonshot/Kimi setup.

If `AI_GATEWAY_BASE_URL` and `AI_GATEWAY_API_KEY` are configured, the platform prefers the gateway path.
If not, it falls back to the direct compatible provider path.

## Next Migration Steps

* Move usage, budget, and cache state out of memory
* Add Firestore-backed AI telemetry collections
* Make prompt versioning explicit
* Retire the deprecated Firebase callable mentor function
* Add modular service entry points for image, video, and voice generation

