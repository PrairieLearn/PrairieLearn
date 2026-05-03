ALTER TABLE course_instances
DROP CONSTRAINT IF EXISTS course_instances_credit_transferable_milli_dollars_check;

ALTER TABLE ai_grading_credit_pool_changes
DROP CONSTRAINT IF EXISTS chk_credit_ledger_math;

ALTER TABLE ai_grading_credit_pool_changes
ADD CONSTRAINT chk_credit_ledger_math CHECK (
  credit_after_milli_dollars = credit_before_milli_dollars + delta_milli_dollars
) NOT VALID;
