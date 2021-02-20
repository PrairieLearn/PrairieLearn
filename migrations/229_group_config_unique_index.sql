DROP INDEX unique_group_config_per_assessment;

CREATE UNIQUE INDEX unique_group_config_per_assessment ON group_configs (assessment_id);
