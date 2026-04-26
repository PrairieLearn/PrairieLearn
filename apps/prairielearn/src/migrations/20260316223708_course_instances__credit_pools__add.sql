ALTER TABLE course_instances
ADD COLUMN credit_transferable_milli_dollars BIGINT NOT NULL DEFAULT 0 CONSTRAINT course_instances_credit_transferable_milli_dollars_check CHECK (credit_transferable_milli_dollars >= 0);

ALTER TABLE course_instances
ADD COLUMN credit_non_transferable_milli_dollars BIGINT NOT NULL DEFAULT 0 CONSTRAINT course_instances_credit_non_transferable_milli_dollars_check CHECK (credit_non_transferable_milli_dollars >= 0);
