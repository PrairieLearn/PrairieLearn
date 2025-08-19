CREATE TABLE ai_cluster_assignments (
    ai_cluster_id BIGINT REFERENCES ai_clusters (id) ON DELETE CASCADE ON UPDATE CASCADE,
    id BIGSERIAL PRIMARY KEY,
    instance_question_id BIGINT NOT NULL REFERENCES instance_questions (id) ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE ai_cluster_assignments
ADD CONSTRAINT ai_cluster_assignments_instance_question_id_unique_constraint UNIQUE (instance_question_id);