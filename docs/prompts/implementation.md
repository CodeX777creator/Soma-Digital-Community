# Implementation Rules

Implement features incrementally.

Reuse existing code.

Never rewrite entire systems.

Never create duplicate services.

Every implementation must:

Update tests

Update documentation

Maintain backward compatibility

Validate security

Validate performance

Produce implementation summary

Wait for approval between major phases.

When working on AI or Academy changes:

- keep the synced model catalog and routing config admin-visible
- preserve learner gating and manual review rules
- ensure Firestore queries have matching indexes before shipping
- document any new collection, route, or admin surface in the architecture docs
