ALTER TABLE assessments
ADD COLUMN statistics_last_updated_at timestamptz NOT NULL DEFAULT now() - interval '100 years';

ALTER TABLE assessments
ADD COLUMN score_stat_number integer NOT NULL DEFAULT 0;

ALTER TABLE assessments
ADD COLUMN score_stat_min double precision NOT NULL DEFAULT 0;

ALTER TABLE assessments
ADD COLUMN score_stat_max double precision NOT NULL DEFAULT 0;

ALTER TABLE assessments
ADD COLUMN score_stat_mean double precision NOT NULL DEFAULT 0;

ALTER TABLE assessments
ADD COLUMN score_stat_std double precision NOT NULL DEFAULT 0;

ALTER TABLE assessments
ADD COLUMN score_stat_median double precision NOT NULL DEFAULT 0;

ALTER TABLE assessments
ADD COLUMN score_stat_n_zero integer NOT NULL DEFAULT 0;

ALTER TABLE assessments
ADD COLUMN score_stat_n_hundred integer NOT NULL DEFAULT 0;

ALTER TABLE assessments
ADD COLUMN score_stat_n_zero_perc double precision NOT NULL DEFAULT 0;

ALTER TABLE assessments
ADD COLUMN score_stat_n_hundred_perc double precision NOT NULL DEFAULT 0;

ALTER TABLE assessments
ADD COLUMN score_stat_hist integer[] NOT NULL DEFAULT ARRAY[]::integer[];

ALTER TABLE assessments
ADD COLUMN duration_stat_min interval NOT NULL DEFAULT interval '0 seconds';

ALTER TABLE assessments
ADD COLUMN duration_stat_max interval NOT NULL DEFAULT interval '0 seconds';

ALTER TABLE assessments
ADD COLUMN duration_stat_mean interval NOT NULL DEFAULT interval '0 seconds';

ALTER TABLE assessments
ADD COLUMN duration_stat_median interval NOT NULL DEFAULT interval '0 seconds';

ALTER TABLE assessments
ADD COLUMN duration_stat_thresholds interval[] NOT NULL DEFAULT ARRAY[]::interval[];

ALTER TABLE assessments
ADD COLUMN duration_stat_threshold_seconds double precision[] NOT NULL DEFAULT ARRAY[]::double precision[];

ALTER TABLE assessments
ADD COLUMN duration_stat_threshold_labels text[] NOT NULL DEFAULT ARRAY[]::text[];

ALTER TABLE assessments
ADD COLUMN duration_stat_hist integer[] NOT NULL DEFAULT ARRAY[]::integer[];
