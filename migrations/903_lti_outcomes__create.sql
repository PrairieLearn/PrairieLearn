CREATE TABLE lti_outcomes (
    id bigserial PRIMARY KEY,
    user_id BIGINT REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE,
    assessment_id BIGINT REFERENCES assessments ON DELETE CASCADE ON UPDATE CASCADE,
    lti_credential_id BIGINT REFERENCES lti_credentials(id) ON DELETE CASCADE ON UPDATE CASCADE,
    lis_result_sourcedid TEXT,
    lis_outcome_service_url TEXT
);

--CREATE INDEX lti_links_resource_link_id_idx ON lti_links (resource_link_id);
ALTER TABLE lti_outcomes
    ADD CONSTRAINT lti_outcomes_user_assessment UNIQUE (user_id, assessment_id);
    
