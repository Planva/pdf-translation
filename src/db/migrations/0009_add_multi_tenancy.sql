-- drizzle/00XX_add_guest_quota.sql
CREATE TABLE IF NOT EXISTS "pdf_translate_com_ops_guest_quota" (
  "day" TEXT NOT NULL,
  "did" TEXT NOT NULL,
  "ip" TEXT,
  "remaining" INTEGER NOT NULL DEFAULT 0,
  "used" INTEGER NOT NULL DEFAULT 0,
  "ipChanges" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" INTEGER NOT NULL,
  PRIMARY KEY("day","did")
);

CREATE INDEX IF NOT EXISTS "idx_pdf_translate_com_ops_guest_quota_day_ip" ON "pdf_translate_com_ops_guest_quota" ("day","ip");
