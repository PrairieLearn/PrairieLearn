CREATE TABLE question_statistics (
    id BIGSERIAL PRIMARY KEY,
    question_id BIGINT NOT NULL REFERENCES questions,
    domain enum_statistic_domain,


    mean_question_score DOUBLE PRECISION,
    question_score_variance DOUBLE PRECISION,
    discrimination DOUBLE PRECISION,
    quintile_question_scores DOUBLE PRECISION[],

    some_submission_perc DOUBLE PRECISION,
    some_perfect_submission_perc DOUBLE PRECISION,
    some_nonzero_submission_perc DOUBLE PRECISION,


    average_first_submission_score DOUBLE PRECISION,
    first_submission_score_variance DOUBLE PRECISION,
    first_submission_score_hist DOUBLE PRECISION[],

    average_last_submission_score DOUBLE PRECISION,
    last_submission_score_variance DOUBLE PRECISION,
    last_submission_score_hist DOUBLE PRECISION[],

    average_max_submission_score DOUBLE PRECISION,
    max_submission_score_variance DOUBLE PRECISION,
    max_submission_score_hist DOUBLE PRECISION[],

    average_average_submission_score DOUBLE PRECISION,
    average_submission_score_variance DOUBLE PRECISION,
    average_submission_score_hist DOUBLE PRECISION[],


    submission_score_array_averages DOUBLE PRECISION[],
    submission_score_array_variances DOUBLE PRECISION[],

    incremental_submission_score_array_averages DOUBLE PRECISION[],
    incremental_submission_score_array_variances DOUBLE PRECISION[],

    incremental_submission_points_array_averages DOUBLE PRECISION[],
    incremental_submission_points_array_variances DOUBLE PRECISION[],


    average_number_submissions DOUBLE PRECISION,
    number_submissions_variance DOUBLE PRECISION,
    number_submissions_hist DOUBLE PRECISION[]
);