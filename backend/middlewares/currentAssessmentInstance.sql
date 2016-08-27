SELECT ai.*
FROM assessment_instances AS ai
WHERE ai.id = $assessmentInstanceId
AND ai.user_id = $userId;
