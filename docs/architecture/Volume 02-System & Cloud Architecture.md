# SDC AI Business Operating System (ABOS)

## Volume 2 — System & Cloud Architecture

**Version:** 1.0
**Status:** Approved Foundation
**Applies To:** Entire Platform

---

# Table of Contents

1. System Overview
2. Architectural Goals
3. High-Level System Architecture
4. C4 Context Diagram
5. C4 Container Diagram
6. Service Architecture
7. Cloud Infrastructure
8. Networking
9. Authentication Architecture
10. Data Architecture
11. AI Architecture
12. Billing Architecture
13. Event Architecture
14. Storage Architecture
15. Security Architecture
16. Scalability Strategy
17. Monitoring & Observability
18. Disaster Recovery
19. Technology Stack
20. Future Evolution

---

# 1. System Overview

SDC is an **AI-first SaaS Business Operating System** built around modular services.

The platform consists of five primary domains:

```text
Presentation Layer
Application Layer
AI Platform
Business Platform
Infrastructure Layer
```

Each domain is independently scalable and communicates through well-defined APIs and events.

---

# 2. Architectural Goals

The architecture must satisfy the following qualities:

* Modular
* Cloud-native
* Event-driven
* Provider-agnostic
* Multi-tenant
* Subscription-aware
* Cost-aware
* Secure by default
* Highly observable
* Horizontally scalable
* Replaceable components
* Enterprise-ready

---

# 3. High-Level System Architecture

```text
                    Users
                      │
      ┌───────────────┴───────────────┐
      │                               │
      ▼                               ▼
 Web Application                Mobile App (Future)
      │
      ▼
Next.js Application
      │
      ▼
Application Services
      │
 ┌────┴─────────────────────────────────────────┐
 │                                              │
 ▼                                              ▼
Business Services                       AI Platform
 │                                              │
 │                                              │
 ▼                                              ▼
Community                          AI Gateway
Marketplace                        AI Orchestrator
Courses                            Credit Engine
Billing                            Provider Registry
Analytics                          Model Catalog
Social Hub                         Prompt Engine
 │                                              │
 └──────────────┬───────────────────────────────┘
                ▼
        Firebase Platform
```

---

# 4. C4 Context Diagram

```text
                 +-------------------+
                 |      Users        |
                 +---------+---------+
                           |
                           ▼
                +----------------------+
                |        SDC           |
                | AI Business OS       |
                +----+-----------+-----+
                     |           |
                     |           |
         +-----------+           +------------+
         |                                    |
         ▼                                    ▼
 AI Providers                         Payment Providers

 OpenAI                               PayPal
 Google                               Paystack
 Anthropic                            Stripe (Future)
 xAI
 Mistral
 ElevenLabs
 Meta
```

---

# 5. C4 Container Diagram

```text
Browser

↓

Next.js Frontend

↓

API Layer

↓

Domain Services

↓

Firestore

↓

Cloud Functions

↓

AI Platform

↓

External Providers
```

---

# 6. Core Service Architecture

SDC is divided into bounded domains.

```text
/services

auth

community

courses

marketplace

messaging

social

analytics

subscriptions

billing

ai

notifications

search

admin

storage

moderation
```

Each service owns:

* Business logic
* Validation
* Events
* API contracts
* Permissions

Services should never access each other's internal implementation directly.

---

# 7. AI Platform

The AI Platform is a first-class subsystem, not a helper library.

```text
AI Platform

AI Gateway

AI Orchestrator

Provider Registry

Model Catalog

Prompt Engine

Memory Engine

Knowledge Engine

Creator Credits

Cost Engine

Job Queue

Asset Library

BYOK

Analytics
```

Every AI request passes through this platform.

---

# 8. AI Request Flow

```text
User Request
      │
Authentication
      │
Subscription Check
      │
Creator Credits
      │
BYOK Decision
      │
Cost Estimation
      │
AI Orchestrator
      │
Provider Selection
      │
AI Gateway
      │
External Provider
      │
Response
      │
Asset Storage
      │
Ledger Update
      │
Analytics
```

No component may bypass this flow.

---

# 9. Firebase Architecture

```text
Firebase

Authentication

Firestore

Cloud Storage

Cloud Functions

Cloud Scheduler

Cloud Tasks

Cloud Logging

Cloud Monitoring

Remote Config (Future)

App Check

FCM
```

Firebase provides the operational backbone of SDC.

---

# 10. Firestore Domain Structure

Collections are grouped by domain.

```text
users

subscriptions

creditAccounts

creditLedger

communities

posts

comments

courses

lessons

products

orders

messages

notifications

events

socialAccounts

scheduledPosts

generatedAssets

aiRequests

providerMetrics

systemConfig

auditLogs
```

Every collection has a documented owner service.

---

# 11. Storage Architecture

Cloud Storage should separate assets by domain.

```text
/users/

/courses/

/community/

/marketplace/

/generated/

/videos/

/voices/

/documents/

/exports/

/temp/

/system/
```

AI-generated content belongs under `/generated/` with lifecycle rules for archival and cleanup.

---

# 12. Authentication

Authentication is handled through Firebase Authentication.

Supported methods:

* Email/Password
* Google
* Microsoft (Future)
* Apple (Future)
* Passkeys (Future)

Authentication provides identity only.

Authorization is handled separately through application roles and permissions.

---

# 13. Authorization

Role-Based Access Control (RBAC)

Default roles:

* Visitor
* Explorer
* Pro
* Elite
* Moderator
* Instructor
* Marketplace Seller
* Admin
* Super Admin
* Enterprise Admin

Roles determine access to features, not business logic.

---

# 14. Billing Architecture

Billing is isolated.

```text
Billing

Subscriptions

Invoices

Payments

Refunds

Creator Credits

Credit Packs

Coupons

Taxes

Provider Webhooks
```

Business logic should consume billing events rather than payment APIs directly.

---

# 15. Social Media Architecture

```text
Social Hub

Accounts

OAuth

Scheduling

Publishing

Analytics

Calendar

Media Library

Content Queue
```

Publishing services must support retries, status tracking, and reusable media.

---

# 16. Event Architecture

Use asynchronous events for cross-service workflows.

Examples:

```text
SubscriptionActivated

CreditsRenewed

CreditsConsumed

CreditsRefunded

AIGenerationCompleted

PostScheduled

PostPublished

CourseCompleted

PurchaseCompleted

PaymentFailed
```

Events should be versioned and documented.

---

# 17. Background Processing

Long-running tasks should never execute synchronously.

Use Cloud Tasks and Cloud Scheduler for:

* Video generation
* Social publishing
* AI processing
* Report generation
* Monthly renewals
* Analytics aggregation
* Cleanup jobs

---

# 18. Security Zones

The platform is divided into trust boundaries.

```text
Public

Authenticated

Premium

Administrative

Infrastructure

External Providers
```

Communication across boundaries requires authentication, authorization, and validation.

---

# 19. Secrets Management

Secrets must never be stored in:

* Firestore
* Client code
* Environment variables exposed to browsers

Use Secret Manager for:

* API keys
* Encryption keys
* Provider credentials
* OAuth secrets

---

# 20. Monitoring

Monitor:

* API latency
* AI latency
* Queue depth
* AI costs
* Error rates
* Billing failures
* Provider uptime
* Credit usage
* Social publishing success
* Infrastructure costs

Dashboards should be available for both operations and business teams.

---

# 21. Logging

Logs are categorized into:

* Application
* Security
* Billing
* AI
* Social
* Marketplace
* Moderation
* Infrastructure

Sensitive information must be redacted before logging.

---

# 22. Scalability Strategy

Scale independently:

* Frontend
* API
* AI Platform
* Background Workers
* Search
* Storage
* Analytics

Avoid monolithic deployments.

---

# 23. Disaster Recovery

Objectives:

* Automated backups
* Point-in-time recovery where supported
* Multi-region storage for critical assets
* Infrastructure as Code
* Documented recovery procedures
* Regular recovery testing

Recovery objectives should be defined for each subsystem.

---

# 24. Technology Stack

| Layer          | Technology                                                      |
| -------------- | --------------------------------------------------------------- |
| Frontend       | Next.js 15 + React + TypeScript                                 |
| Styling        | Tailwind CSS + shadcn/ui                                        |
| Backend        | Firebase Functions (Node.js/TypeScript)                         |
| Database       | Firestore                                                       |
| Storage        | Cloud Storage                                                   |
| Authentication | Firebase Auth                                                   |
| AI Routing     | Internal AI Service Layer + Vercel AI Gateway (initially)       |
| AI Models      | Google, OpenAI, Anthropic, xAI, Meta, Mistral, ElevenLabs, etc. |
| Payments       | PayPal + Paystack (Stripe future)                               |
| Deployment     | Vercel (frontend), Firebase (backend)                           |
| Monitoring     | Google Cloud Monitoring + Logging                               |
| Source Control | GitHub                                                          |
| CI/CD          | GitHub Actions + Vercel + Firebase                              |

---

# 25. Future Evolution

The architecture is intentionally designed to evolve without major rewrites.

### Near-term

* AI Gateway
* AI Studio
* Creator Credits
* Social Automation
* Marketplace

### Mid-term

* AI Agents
* CRM
* Workflow Automation
* Enterprise Workspaces
* Public API

### Long-term

* Proprietary Soma AI Gateway
* Specialized Soma AI Models
* Third-party Plugin Marketplace
* White-label deployments
* Developer SDK
* Multi-region infrastructure

---