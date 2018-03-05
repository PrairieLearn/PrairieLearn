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
    END IF;
END;
$$ LANGUAGE plpgsql VOLATILE;
