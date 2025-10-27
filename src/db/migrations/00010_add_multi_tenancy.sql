-- drizzle/0012_add_stripe_customer_map.sql
CREATE TABLE IF NOT EXISTS `pdf_translate_com_fin_stripe_customer_map` (
  customerId TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS `idx_pdf_translate_com_fin_stripe_customer_map_user_id` ON `pdf_translate_com_fin_stripe_customer_map`(userId);
