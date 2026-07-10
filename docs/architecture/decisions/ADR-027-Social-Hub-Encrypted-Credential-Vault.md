# ADR-027: Social Hub Encrypted Credential Vault

Date: 2026-07-10

## Status

Accepted

## Context

SDC needs to manage connected social accounts without exposing OAuth material in Firestore or in client-side state.

The project also needs an incremental social architecture that can later support publishing, scheduling, and analytics without changing the account model.

## Decision

We added a dedicated social hub module that:

- Stores social account records in the canonical `socialAccounts` collection
- Encrypts credential payloads before they are written to Firestore
- Uses an application master key that should be sourced from secret management in deployment
- Keeps the client-facing API free of raw OAuth tokens
- Provides a shared provider registry for the supported networks

## Consequences

Positive:

- OAuth material is not stored in plaintext
- The social hub can support multiple providers through a single API surface
- Future phases can add scheduling and publishing without changing the account schema

Tradeoffs:

- The app now depends on a correctly provisioned master key for credential encryption and decryption
- Provider-specific OAuth handshakes still need separate callback flows when those integrations are added

## Follow-up

- Add provider callback routes and token refresh flows in later phases
- Move the master key into the preferred deployment secret store for each environment
