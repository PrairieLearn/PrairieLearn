ALTER TABLE lti13_assessments
ADD CONSTRAINT lti13_assessments_assessment_id_lti13_course_instance_id_key UNIQUE USING INDEX lti13_assessments_assessment_id_lti13_course_instance_id_idx;

-- An assessment may now be linked to an assignment in each connected LMS course,
-- so uniqueness is scoped to the LTI 1.3 course instance.
ALTER TABLE lti13_assessments
DROP CONSTRAINT lti13_assessments_assessment_id_key;
