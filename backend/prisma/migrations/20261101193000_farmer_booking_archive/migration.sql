ALTER TABLE "Booking"
ADD COLUMN "farmerArchivedAt" TIMESTAMP(3);

CREATE INDEX "Booking_farmerId_farmerArchivedAt_createdAt_idx"
ON "Booking"("farmerId", "farmerArchivedAt", "createdAt");
