CREATE TYPE "DeliveryMode" AS ENUM ('PICKUP', 'DELIVERY');

ALTER TABLE "Booking"
ADD COLUMN "deliveryMode" "DeliveryMode" NOT NULL DEFAULT 'PICKUP',
ADD COLUMN "deliveryAddress" TEXT,
ADD COLUMN "rentalNotes" TEXT;

CREATE TABLE "PaymentWebhookEvent" (
    "id" UUID NOT NULL,
    "razorpayEventId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    CONSTRAINT "PaymentWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentWebhookEvent_razorpayEventId_key" ON "PaymentWebhookEvent"("razorpayEventId");
CREATE INDEX "PaymentWebhookEvent_event_receivedAt_idx" ON "PaymentWebhookEvent"("event", "receivedAt");
