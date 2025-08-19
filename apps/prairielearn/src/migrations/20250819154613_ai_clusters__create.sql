CREATE TABLE ai_clusters (
    assessment_question_id BIGINT NOT NULL REFERENCES assessment_questions (id) ON DELETE CASCADE ON UPDATE CASCADE,
    cluster_name TEXT NOT NULL,
    id BIGSERIAL PRIMARY KEY
);

ALTER TABLE ai_clusters
ADD CONSTRAINT ai_clusters_unique_constraint UNIQUE (assessment_question_id, cluster_name);