UPDATE assessment_instances AS ai
SET include_in_statistics = NOT users_is_instructor_in_course_instance(ai.user_id, a.course_instance_id)
FROM assessments AS a
WHERE
    ai.assessment_id = a.id
    AND ai.date > now() - interval '4 months';
