ALTER TABLE page_view_logs ADD COLUMN IF NOT EXISTS panel_render_count int DEFAULT NULL;
ALTER TABLE page_view_logs ADD COLUMN IF NOT EXISTS panel_render_cache_hit_count int DEFAULT NULL;
