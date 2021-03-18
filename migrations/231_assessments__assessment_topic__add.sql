ALTER TABLE assessments ADD COLUMN assessment_topic_id BIGINT;
ALTER TABLE assessments ADD FOREIGN KEY (assessment_topic_id) REFERENCES topics(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE topics ADD COLUMN heading TEXT;
