-- BLOCK select_recent_images
SELECT DISTINCT q.external_grading_image
FROM grading_jobs AS gj
JOIN submissions AS s ON (s.id = gj.submission_id)
JOIN variants AS v ON (v.id = s.variant_id)
JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
JOIN questions AS q ON (q.id = aq.question_id)
WHERE gj.grading_requested_at >= (NOW() - INTERVAL '1 hour');
