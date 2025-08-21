ALTER TABLE instance_questions
ADD COLUMN ai_cluster_id bigint REFERENCES ai_clusters(id) ON UPDATE CASCADE ON DELETE SET NULL;