CREATE OR REPLACE FUNCTION
    get_domain (
        type_var enum_assessment_type,
        mode_var enum_mode
    ) RETURNS enum_statistic_domain AS $$
BEGIN
    IF type_var IS NULL THEN
        RETURN NULL;
    ELSIF mode_var IS NULL THEN
        mode_var = 'Exam';
    END IF;

    IF type_var = 'Exam' AND mode_var = 'Exam' THEN
        RETURN 'Exams';
    ELSIF type_var = 'Exam' AND mode_var = 'Public' THEN
        RETURN 'PracticeExams';
    ELSIF type_var = 'Homework' and mode_var = 'Public' THEN
        RETURN 'HWs';
    ELSE
        RETURN NULL;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION
    get_domain(
        IN assessment_id_var BIGINT,
        OUT domain enum_statistic_domain
)
AS $$
BEGIN
    SELECT
        get_domain(a.type, a.mode)
    FROM
        assessments AS a
    WHERE
        a.id = assessment_id_var
    INTO
        domain;
END;
$$ LANGUAGE plpgsql VOLATILE;
