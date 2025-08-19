-- BLOCK create_ai_cluster
INSERT INTO ai_clusters
    (assessment_question_id, cluster_name)
VALUES
    ($assessment_question_id, $cluster_name)

-- BLOCK select_exists_ai_clusters
SELECT
    EXISTS (
        SELECT
            1
        FROM
            ai_clusters
        WHERE
            assessment_question_id = $assessment_question_id
    );

-- BLOCK select_ai_clusters
SELECT 
    *
FROM
    ai_clusters 
WHERE
    assessment_question_id = $assessment_question_id;

-- BLOCK select_ai_cluster_assignment_for_instance_question
SELECT
    ai_clusters.*
FROM
    ai_cluster_assignments
JOIN
    ai_clusters
ON 
    ai_cluster_assignments.ai_cluster_id = ai_clusters.id
WHERE
    instance_question_id = $instance_question_id

-- BLOCK upsert_ai_cluster_for_instance_question
INSERT INTO ai_cluster_assignments
    (ai_cluster_id, instance_question_id)
VALUES
    ($ai_cluster_id, $instance_question_id)
ON CONFLICT (instance_question_id) DO UPDATE
SET ai_cluster_id = $ai_cluster_id

-- BLOCK select_ai_cluster_assignment
SELECT
    ac.cluster_name,
    ai_cluster_assignments.instance_question_id
FROM
    ai_cluster_assignments
JOIN 
    instance_questions as iq
ON
    ai_cluster_assignments.instance_question_id = iq.id
JOIN
    ai_clusters as ac
ON
    ai_cluster_assignments.ai_cluster_id = ac.id
WHERE
    iq.assessment_question_id = $assessment_question_id

-- BLOCK delete_ai_clustering_assignments_for_assessment_question

WITH deleted AS (
  DELETE FROM ai_cluster_assignments
  USING instance_questions AS iq
  WHERE ai_cluster_assignments.instance_question_id = iq.id
    AND iq.assessment_question_id = $assessment_question_id
  RETURNING *
)
SELECT COUNT(*)::int FROM deleted;