ALTER TABLE course_instances
ADD COLUMN credit_transferable_milli_dollars BIGINT NOT NULL DEFAULT 0;

ALTER TABLE course_instances
ADD COLUMN credit_non_transferable_milli_dollars BIGINT NOT NULL DEFAULT 0;
