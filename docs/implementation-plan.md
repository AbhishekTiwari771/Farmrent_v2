# FarmRent technical implementation plan

## Architecture

Use a small npm workspace monorepo. The Next.js App Router application owns the customer-facing experience. A versioned Express API is the modular business backend and owns authorization, validation and persistence. PostgreSQL on Neon with Prisma is the system of record. FastAPI remains a separate service for recommendation and prediction workloads. Clerk provides identity, while FarmRent's database stores application roles against the Clerk subject. No payment or AI success state is trusted from the browser.

## Phases

1. **Foundation and public experience:** workspace, design tokens, responsive landing page and searchable/filterable equipment marketplace. Seed listings are visibly demo content until persisted data is connected.
2. **Identity and data:** Clerk integration, user synchronization, Prisma migrations/seed, equipment and category APIs, owner listing workflow and moderation.
3. **Availability and booking:** transactional overlap protection, booking state machine, owner actions and farmer booking views.
4. **Payments:** Razorpay test checkout, server-side HMAC verification, idempotent webhooks, refund tracking and settlement ledger.
5. **AI:** marketplace-grounded assistant and constraint-aware recommendation endpoint.
6. **ML:** evaluated price estimate and demand forecast, with uncertainty and provenance.
7. **Admin and operations:** secure admin provisioning, analytics, notifications, map support and audit trails.
8. **Hardening and release:** automated tests, security review, deployment guides and production configuration.

## First milestone boundaries

The public experience will be useful without external credentials. Demo data will not be presented as actual platform inventory or operational statistics. Backend and AI scaffolds will establish clear contracts, but production integrations will be introduced in their respective phases and only reported complete after verification.

## Image credits

The sample machinery photos use images published on Unsplash under the Unsplash License: [tractor with seeding equipment by Tomas Hudolin](https://unsplash.com/photos/a-tractor-is-driving-through-a-field-at-sunset-9EmU19DzXxg), [tractor with cultivator by Roger Starnes Sr](https://unsplash.com/photos/a-tractor-is-plowing-a-field-of-crops-3CF3FGFqJQ0), [tractor planter by Loren King](https://unsplash.com/photos/a-tractor-plowing-a-field-in-the-middle-of-the-day-faQ_O3_uLQg), [crop sprayer by Troy Mortier](https://unsplash.com/photos/agricultural-sprayer-operating-in-a-field-of-young-plants-Z4QfrytvcDo), and harvesters by [Wolfgang Weiser](https://unsplash.com/photos/LcmKKm10aIM) and [The Manh](https://unsplash.com/photos/combine-harvester-working-in-a-golden-rice-field-FuLGc7_JyAY). Product listing photos are illustrative, not photos of verified inventory.
