ALTER TABLE assessments
ADD COLUMN constant_question_value boolean default false;

ALTER TABLE variants
ADD COLUMN num_tries integer not null default 0;

ALTER TABLE assessment_questions
ADD COLUMN tries_per_variant integer default 1;

ALTER TABLE instance_questions
ADD COLUMN variants_points_list double precision[] not null default ARRAY[]::double precision[]
