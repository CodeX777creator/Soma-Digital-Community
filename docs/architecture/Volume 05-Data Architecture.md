# SDC AI Business Operating System (ABOS)

# Volume 5 — Data Architecture & Database Design

**Version:** 1.0

**Status:** Canonical Data Model

**Owner:** Coach Tedd

---

# Table of Contents

1. Data Philosophy
2. Data Architecture Principles
3. Firestore Strategy
4. Collection Standards
5. Core Collections
6. AI Platform Collections
7. Billing Collections
8. Community Collections
9. Learning Collections
10. Marketplace Collections
11. Social Media Collections
12. Analytics Collections
13. Search & Vector Architecture
14. Storage Architecture
15. Event Store
16. Security Rules
17. Index Strategy
18. Data Lifecycle
19. Multi-Tenancy
20. Backup & Disaster Recovery

---

# 1. Data Philosophy

Data is one of SDC's most valuable assets.

Every piece of information should be:

* Owned by exactly one domain.
* Versionable where appropriate.
* Secure by default.
* Auditable.
* Designed for horizontal scaling.
* Structured for analytics.
* Suitable for future AI training with explicit user consent and appropriate anonymization where required.

The database exists to support business capabilities—not the other way around.

---

# 2. Data Architecture Principles

### Single Source of Truth

Each entity has one canonical location.

Avoid duplicating mutable data across collections.

---

### Event-Driven Updates

Cross-domain synchronization should rely on events rather than direct writes whenever feasible.

---

### Immutable History

Critical business events (billing, credits, moderation, AI requests) should append records rather than overwrite history.

---

### Read Optimization

Firestore favors read performance.

Use denormalization selectively for frequently accessed views while maintaining a clear canonical source.

---

# 3. Firestore Structure

Top-level collections:

```text
users
organizations
subscriptions
creditAccounts
creditLedger
aiRequests
aiJobs
generatedAssets
providerHealth
providerMetrics
promptTemplates
promptVersions
userMemory
knowledgeSources
knowledgeChunks
socialAccounts
scheduledPosts
socialCampaigns
communities
groups
posts
comments
reactions
courses
modules
lessons
enrollments
products
orders
payments
notifications
auditLogs
systemConfig
featureFlags
analytics
searchIndex
events
```

Each collection has a designated owning service.

---

# 4. Collection Standards

Every document should include common metadata:

```typescript
id
createdAt
updatedAt
createdBy
updatedBy
status
version
tenantId (future)
```

This consistency simplifies tooling, migrations, and auditing.

---

# 5. User Domain

## users

```typescript
User

uid

email

displayName

photoURL

plan

subscriptionStatus

roles[]

permissions[]

profile

preferences

businessProfile

aiPreferences

socialProfiles

language

timezone

createdAt

updatedAt
```

### Subcollections

```text
users/{uid}/devices
users/{uid}/sessions
users/{uid}/notifications
users/{uid}/activity
users/{uid}/savedAssets
users/{uid}/savedPrompts
users/{uid}/mentorHistory
users/{uid}/mentorMemory
```

---

# 6. Subscription Domain

## subscriptions

```typescript
Subscription

userId

provider

providerSubscriptionId

plan

status

currentPeriodStart

currentPeriodEnd

cancelAtPeriodEnd

trialEndsAt

renewalDate

metadata
```

---

# 7. Creator Credit Platform

## creditAccounts

```typescript
CreditAccount

userId

monthlyCredits

bonusCredits

purchasedCredits

reservedCredits

usedCredits

remainingCredits

renewalDate

plan
```

---

## creditLedger

Append-only:

```typescript
CreditLedger

transactionId

userId

feature

provider

model

creditsReserved

creditsCharged

creditsRefunded

requestId

timestamp

status
```

---

# 8. AI Platform

## aiRequests

```typescript
AIRequest

requestId

userId

feature

provider

model

qualityMode

credits

estimatedCost

actualCost

status

latency

duration

startedAt

completedAt
```

---

## aiJobs

```typescript
AIJob

jobId

type

priority

status

provider

attempts

queue

startedAt

completedAt
```

---

## generatedAssets

```typescript
GeneratedAsset

assetId

ownerId

type

provider

model

storagePath

thumbnail

credits

promptVersion

visibility

tags

checksum

createdAt
```

---

# 9. Prompt System

## promptTemplates

```typescript
PromptTemplate

name

category

systemPrompt

userTemplate

variables

status

currentVersion
```

---

## promptVersions

Stores immutable historical versions.

---

# 10. AI Memory

## userMemory

```typescript
Memory

userId

category

summary

embeddingId

importance

lastUsed

expiresAt
```

This allows efficient retrieval and lifecycle management.

---

# 11. Knowledge Engine

## knowledgeSources

Represents uploaded or managed content.

```typescript
KnowledgeSource

sourceId

ownerId

title

type

status

visibility

version
```

---

## knowledgeChunks

```typescript
Chunk

sourceId

chunkIndex

text

embeddingId

checksum

metadata
```

---

# 12. Community

## posts

```typescript
Post

postId

authorId

content

attachments

visibility

tags

engagement

createdAt
```

---

## comments

Linked to posts.

---

## reactions

Stores normalized reaction events.

---

## groups

Community groups and memberships.

---

# 13. Learning Platform

## courses

```typescript
Course

title

description

instructor

status

difficulty

language

price

thumbnail
```

---

## lessons

```typescript
Lesson

courseId

moduleId

title

content

duration

resources

quizId
```

---

## enrollments

Tracks learner progress, completion, certificates, and timestamps.

---

# 14. Marketplace

## products

Digital products, templates, prompt packs, AI agents (future), and services.

---

## orders

```typescript
Order

buyerId

sellerId

items

total

currency

status

paymentId
```

---

# 15. Social Media Hub

## socialAccounts

OAuth references and provider metadata.

Tokens should be stored securely outside Firestore when possible, with Firestore containing references and non-sensitive metadata.

---

## scheduledPosts

```typescript
ScheduledPost

ownerId

platform

socialAccountId

status

scheduledTime

assetIds

caption

campaignId

attemptCount

lastAttemptAt

nextRetryAt

publishLeaseId

publishLeaseExpiresAt

publishedBy

publishedAt

failedAt

lastError

externalPostId
```

---

## socialCampaigns

Group scheduled posts into campaigns with objectives, analytics, and reusable templates.

---

## socialPublishAttempts

Append-only audit trail for every publish attempt.

Each document records:

```typescript
PublishAttempt

scheduledPostId

ownerId

platform

socialAccountId

attemptNumber

status

triggeredAt

startedAt

finishedAt

externalPostId

errorMessage

providerResponse

retryable
```

Use this collection for operational visibility, retry analysis, and post-mortem debugging. It should not be edited in place.

---

# 16. Notifications

```typescript
Notification

userId

type

title

message

channel

read

sentAt
```

---

# 17. Audit Logs

Immutable records for security-sensitive actions.

```typescript
AuditLog

actorId

action

resource

resourceId

ipHash

userAgent

timestamp

result
```

Store hashed or truncated identifiers where appropriate to minimize sensitive data exposure.

---

# 18. Analytics Collections

Prefer a hybrid approach:

* Firestore for operational summaries and dashboards.
* BigQuery for historical analytics, reporting, and large-scale aggregations.

Examples:

```text
aiUsageEvents

socialPublishAttempts

dailyUsage

monthlyUsage

providerCosts

featureMetrics

revenueMetrics

analyticsDaily
```

`aiUsageEvents` is an append-only operational log for AI requests. `socialPublishAttempts` stores the publish trail for every scheduled post attempt. `analyticsDaily` can hold rollups if the project introduces scheduled aggregation later.

---

# 19. Search & Vector Architecture

Traditional search indexes:

* Posts
* Courses
* Products
* Assets

Vector search indexes:

* User memory
* Knowledge chunks
* Prompt similarity
* AI assets

Embedding references should point to the underlying vector store rather than embedding large vectors directly into Firestore.

---

# 20. Cloud Storage Layout

```text
/users/

/community/

/courses/

/marketplace/

/generated/

/generated/images/

/generated/videos/

/generated/audio/

/generated/documents/

/campaigns/

/exports/

/temp/

/system/
```

Configure lifecycle rules for temporary files and archived content.

---

# 21. Event Store

Every significant domain event should be recorded.

```typescript
Event

eventId

type

aggregateId

aggregateType

version

timestamp

payloadReference
```

Events support analytics, troubleshooting, and future event-driven workflows.

---

# 22. Security Rules

Principles:

* Deny by default.
* Least privilege.
* Validate ownership.
* Validate subscription where required.
* Restrict admin operations.
* Enforce server-side writes for sensitive collections (credits, subscriptions, audit logs, AI requests).

---

# 23. Index Strategy

Create composite indexes for high-frequency queries, including:

* User + createdAt
* Status + scheduledTime
* Provider + timestamp
* Course + module
* Campaign + platform

Review indexes regularly to remove unused ones and optimize costs.

---

# 24. Multi-Tenant Readiness

Although SDC begins as a single-tenant platform, schemas should support future organizations.

Prepare for:

```typescript
organizationId

workspaceId

teamId

tenantId
```

Business logic should avoid assumptions that every resource belongs only to an individual user.

---

# 25. Backup & Disaster Recovery

* Automated Firestore exports.
* Cloud Storage versioning where appropriate.
* Document retention policies.
* Regular restore testing.
* Infrastructure as Code for reproducible environments.
* Defined recovery objectives (RTO/RPO) for critical domains.

---
