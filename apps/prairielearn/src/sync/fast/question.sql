-- BLOCK select_matching_question
SELECT * FROM questions WHERE qid = ANY($qids::text[]);
