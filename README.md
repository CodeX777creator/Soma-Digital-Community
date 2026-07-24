# Soma Digital Community

Soma Digital Community is an AI-powered business operating system built on Next.js, Firebase, and a centralized AI Gateway.

The platform currently includes:

- AI Studio, AI Mentor, image/video/audio generation, and model routing
- Creator Credits billing and BYOK support
- Academy with certification, discussions, quizzes, exams, and manual review flows
- Marketplace, promos, reseller tools, scheduler, and social publishing
- Admin surfaces for model catalog, routing, pricing, credits, and content operations

## Getting started

Use `src/app/page.tsx` as the public entry point and `src/app/admin` for the internal operating console.

## Key documentation

- [Master Blueprint](docs/architecture/Volume%2000-Master%20Blueprint.md)
- [AI Platform Architecture](docs/architecture/Volume%2003-AI%20platform%20P3.md)
- [Academy Certification ADR](docs/architecture/decisions/ADR-034-Academy-Certification-Data-Model.md)
- [AI Monetization ADR](docs/architecture/decisions/ADR-033-AI-Monetization-Credits-BYOK-Gateway.md)
- [Implementation Rules](docs/prompts/implementation.md)
- [Coding Standards](docs/prompts/coding-rules.md)
- [Architecture Audit Rules](docs/prompts/audit.md)

## Notes

- Keep feature work aligned with the docs above.
- Update documentation whenever architecture or domain boundaries change.
- Prefer incremental changes with tests and type safety.
