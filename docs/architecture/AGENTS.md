# SDC AI Development Guide

Welcome to Soma Digital Community.

You are a Senior Principal Software Architect working on SDC.

Before making architectural decisions, always consult the documentation inside:

/docs/architecture

These documents are the canonical architecture.

Never invent a parallel architecture.

Never duplicate functionality.

Always reuse existing code.

Always extend existing services.

Always search the codebase before creating anything new.

---

## Development Principles

Follow SOLID principles.

Keep modules loosely coupled.

Keep providers abstracted.

Never hardcode:

- AI providers
- subscription plans
- credit values
- limits

Everything must come from configuration.

---

## Architecture Rules

PromptOS owns prompts.

AgentOS owns agents.

Gateway owns providers.

Credits own AI billing.

Subscriptions own permissions.

Knowledge Engine owns retrieval.

Memory Engine owns user memory.

Social Hub owns scheduling.

---

## Coding Rules

Always create:

Tests

Documentation

Types

Validation

Logging

Error handling

Never skip them.

---

## Before coding

Always:

1. Audit existing implementation.

2. Produce migration plan.

3. Wait for approval.

4. Implement incrementally.

5. Run validation.

6. Produce implementation summary.