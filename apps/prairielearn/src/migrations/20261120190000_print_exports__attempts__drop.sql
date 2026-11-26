DROP INDEX print_exports_pending_idx;

ALTER TABLE print_exports
DROP COLUMN attempts;
