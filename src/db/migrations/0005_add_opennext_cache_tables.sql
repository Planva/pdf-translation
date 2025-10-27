-- Create table for storing tags and their associated paths
CREATE TABLE IF NOT EXISTS `pdf_translate_com_core_tags` (
    tag TEXT NOT NULL,
    path TEXT NOT NULL,
    UNIQUE(tag, path) ON CONFLICT REPLACE
);

-- Create table for storing revalidation timestamps
CREATE TABLE IF NOT EXISTS `pdf_translate_com_core_revalidations` (
    tag TEXT NOT NULL,
    revalidatedAt INTEGER NOT NULL,
    UNIQUE(tag) ON CONFLICT REPLACE
);
