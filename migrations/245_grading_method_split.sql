-- Add new grading columns
ALTER TABLE submissions 
    ADD COLUMN IF NOT EXISTS grading_method_internal boolean DEFAULT True,
    ADD COLUMN IF NOT EXISTS grading_method_external boolean DEFAULT False,
    ADD COLUMN IF NOT EXISTS grading_method_manual boolean DEFAULT False;
ALTER TABLE questions
    ADD COLUMN IF NOT EXISTS grading_method_internal boolean DEFAULT True,
    ADD COLUMN IF NOT EXISTS grading_method_external boolean DEFAULT False,
    ADD COLUMN IF NOT EXISTS grading_method_manual boolean DEFAULT False;

-- Update based on old values
UPDATE submissions 
    SET grading_method_internal = grading_method = 'Internal',
        grading_method_external = grading_method = 'External',
        grading_method_manual   = grading_method = 'Manual';
UPDATE questions 
    SET grading_method_internal = grading_method = 'Internal',
        grading_method_external = grading_method = 'External',
        grading_method_manual   = grading_method = 'Manual';

-- Drop old grading method column
ALTER TABLE submissions DROP COLUMN IF EXISTS grading_method;
ALTER TABLE questions DROP COLUMN IF EXISTS grading_method;
