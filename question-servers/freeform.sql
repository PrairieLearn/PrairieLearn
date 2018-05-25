-- BLOCK update_page_view_logs_panel_render_info
UPDATE page_view_logs
SET
    panel_render_count = $panel_render_count,
    panel_render_cache_hit_count = $panel_render_cache_hit_count
WHERE
    id = $page_view_log_id;
