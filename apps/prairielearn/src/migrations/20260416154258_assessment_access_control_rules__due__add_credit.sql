-- Add the custom due-date credit column. NULL means "default credit" (100%).
ALTER TABLE assessment_access_control_rules
ADD COLUMN date_control_due_credit integer CHECK (date_control_due_credit >= 0);

-- The "due" object now overrides atomically (date and credit together), so the
-- per-field overridden flag covers the whole object. Rename for clarity.
ALTER TABLE assessment_access_control_rules
RENAME COLUMN date_control_due_date_overridden TO date_control_due_overridden;
