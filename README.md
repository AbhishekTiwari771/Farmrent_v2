# FarmRent

Smart Farming. Shared Resources. Better Harvests.

FarmRent is an agricultural equipment rental marketplace for India. This repository is a greenfield monorepo with a Next.js public web application, a modular Express API, and a separate FastAPI AI service.

## Current milestone

FarmRent now reads equipment listings and categories from Neon, ships 42 seeded categories and six clearly marked college-demo equipment records, and supports owner listing creation, image uploads, editing and deactivation. Authenticated farmers can choose dates, pickup or delivery, and rental notes, review a server-calculated price breakdown, then pay through Razorpay Standard Checkout. FarmRent creates orders on the server, verifies checkout signatures and captured status, and uses signed, idempotent webhooks before confirming a booking. The database reserves dates transactionally while checkout is pending and notifies the owner after payment.

The six seeded records use fictional sample owners and indicative sample rates. They are for demonstrations only. Razorpay test credentials are required to run checkout; no payment succeeds without a captured provider payment. Refund processing and owner settlements are not wired yet. Newly published owner listings become visible immediately because administrator listing moderation is not implemented in this milestone.

## Structure

- `frontend/` — Next.js App Router, TypeScript, Tailwind CSS.
- `backend/` — Express REST API, TypeScript, Zod and Prisma schema.
- `ai-service/` — FastAPI marketplace assistant and weighted equipment recommendation service.
- `docs/` — implementation plan and architecture notes.

## Run locally

Requirements: Node.js 20+, npm 10+, Python 3.11+ for the AI service.

```bash
npm install
npm run dev
```

The web app defaults to `http://localhost:3000`; the API defaults to `http://localhost:4000`. Start the AI service separately in another terminal:

```bash
cd ai-service
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

The signed-in Farmer workspace links to **AI assistant** at `/farmer/assistant`, and the floating FarmRent AI button opens it site-wide. The assistant searches active listings, ranks them by equipment, budget, location, crop, and acreage, and can use an LLM for conversational answers grounded in those listings. It does not claim date availability; the booking flow checks dates. For local use, set `FARMRENT_API_URL` and `AI_API_KEY` in `ai-service/.env`; `AI_API_BASE_URL` defaults to OpenAI's API and `AI_MODEL` can select a model available to that key. For a Neon AI Gateway key, set `AI_API_BASE_URL` to the branch gateway's `/openai/v1` endpoint and `AI_MODEL` to an enabled catalog model. Keep the provider key only in `ai-service/.env` or the AI host's secret settings; never add it to `frontend/.env` or browser code. The signed-in frontend calls the Express API, which proxies to the AI service using the private matching `AI_SERVICE_API_KEY` configured in `backend/.env` and `ai-service/.env`. Set `AI_SERVICE_URL` in `backend/.env` for a deployed AI service. The chat endpoint falls back to grounded marketplace answers when `AI_API_KEY` is empty; recommendations continue to work without an LLM key. Predictive rental pricing and demand forecasting remain later AI milestones.

Copy `.env.example` files as needed. External integrations (Clerk, Neon, Razorpay, Cloudinary, Resend, and an LLM provider) require credentials. Keep Razorpay Key Secret and Webhook Secret in backend/.env; only test mode keys should be used for the college demo.

For the database, set Neon’s pooled application URL as `DATABASE_URL` and its direct connection URL as `DATABASE_URL_UNPOOLED` in `backend/.env`. Prisma uses the direct URL for migrations and the pooled URL for regular application traffic. Then run:

```bash
npm run db:generate --workspace backend
npm run db:migrate:deploy --workspace backend
npm run db:seed --workspace backend
```

For payments, add Razorpay Test Mode `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and a separate `RAZORPAY_WEBHOOK_SECRET` to `backend/.env`. Configure the webhook endpoint as `/api/v1/payments/webhook` in the Razorpay Test Mode dashboard and subscribe to `payment.captured` and `payment.failed`. The frontend receives only the public Key ID from the backend. For Clerk, `clerk env pull` writes development keys to `frontend/.env`. The backend loads those keys in local development when `backend/.env` does not override them; production must receive `CLERK_SECRET_KEY` from its host environment. The frontend uses `NEXT_PUBLIC_API_URL=/api/v1` and Next.js rewrites proxy requests to the backend configured by `FARMRENT_API_ORIGIN` (default `http://127.0.0.1:4000`). Set `FARMRENT_API_ORIGIN` to the deployed backend origin in the frontend host environment. Set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` in `backend/.env` to enable signed owner photo uploads. Neon CLI configuration and branch connection variables are in the ignored root `.env.local`; the backend uses the supplied connection URLs in `backend/.env`.

## Delivery sequence

See [the technical plan](docs/implementation-plan.md). Owner listing API routes are under `/api/v1/owner/equipment`: `GET /mine`, `POST /images/signature`, `POST /`, `PATCH /:id`, and `DELETE /:id`. Rental checkout uses `/api/v1/payments/quote`, `/orders` and `/verify`; webhooks are received at `/api/v1/payments/webhook`. Seeded demo owners cannot sign in, so use your own owner listing and a second account for a complete rental demonstration. Payment details are not stored by FarmRent; Razorpay Checkout handles payment entry.
