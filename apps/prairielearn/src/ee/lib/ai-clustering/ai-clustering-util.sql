-- BLOCK insert_ai_cluster
INSERT INTO
  ai_clusters (
    assessment_question_id,
    cluster_name,
    cluster_description
  )
VALUES
  (
    $assessment_question_id,
    $cluster_name,
    $cluster_description
  )
  -- BLOCK select_assessment_question_has_ai_clusters
SELECT
  EXISTS (
    SELECT
      1
    FROM
      ai_clusters
    WHERE
      assessment_question_id = $assessment_question_id
  );

-- BLOCK select_ai_cluster
SELECT
  *
FROM
  ai_clusters
WHERE
  id = $ai_cluster_id;

-- BLOCK select_ai_clusters
SELECT
  *
FROM
  ai_clusters
WHERE
  assessment_question_id = $assessment_question_id;

-- BLOCK update_instance_question_ai_cluster
UPDATE instance_questions
SET
  ai_cluster_id = $ai_cluster_id
WHERE
  id = $instance_question_id
  -- BLOCK reset_instance_questions_ai_clusters
WITH
  updated AS (
    UPDATE instance_questions
    SET
      ai_cluster_id = NULL
    WHERE
      assessment_question_id = $assessment_question_id
    RETURNING
      *
  )
SELECT
  COUNT(*)::int
FROM
  updated;
