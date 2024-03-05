ALTER TABLE questions
ADD COLUMN partial_credit boolean DEFAULT TRUE;

UPDATE questions
SET
  partial_credit = (type = 'Freeform');
