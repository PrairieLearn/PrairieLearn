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

CREATE UNIQUE INDEX question_statistics_question_id_and_domain_idx ON question_statistics (question_id, domain);

ALTER TABLE question_statistics ADD COLUMN IF NOT EXISTS number_submissions_hist_with_perfect_submission DOUBLE PRECISION[];
ALTER TABLE question_statistics ADD COLUMN IF NOT EXISTS number_submissions_hist_with_no_perfect_submission DOUBLE PRECISION[];
ALTER TABLE question_statistics ADD COLUMN IF NOT EXISTS incremental_submission_score_array_quintile_averages DOUBLE PRECISION[][];
ALTER TABLE question_statistics ADD COLUMN IF NOT EXISTS last_submission_score_variance_quintiles DOUBLE PRECISION[];
ALTER TABLE question_statistics ADD COLUMN IF NOT EXISTS incremental_submission_score_array_variance_quintiles DOUBLE PRECISION[][];
ALTER TABLE question_statistics ADD COLUMN IF NOT EXISTS average_last_submission_score_quintiles DOUBLE PRECISION[][];
