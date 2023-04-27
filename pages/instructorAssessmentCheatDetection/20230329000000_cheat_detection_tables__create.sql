
---------------------------------
-- Tables for detection rules
---------------------------------
-- pairwise_rules
CREATE TABLE IF NOT EXISTS
  pairwise_rules (
    student1 INTEGER NOT NULL,
    student2 INTEGER NOT NULL,
    rule1_violations TEXT,
    rule1_prob DOUBLE PRECISION,
    rule1_percentile DOUBLE PRECISION,
    rule2_violations TEXT,
    rule2_prob DOUBLE PRECISION,
    rule2_percentile DOUBLE PRECISION,
    rule3_violations TEXT,
    rule3_prob DOUBLE PRECISION,
    rule3_percentile DOUBLE PRECISION,
    rule4_violations TEXT,
    rule4_prob DOUBLE PRECISION,
    rule4_percentile DOUBLE PRECISION,
    overall_prob DOUBLE PRECISION,
    PRIMARY KEY (student1, student2)
);
-- individual_rule
CREATE TABLE IF NOT EXISTS
  individual_rule (
    student INTEGER NOT NULL,
    rule5_score_time_ratio DOUBLE PRECISION,
    rule5_total_score DOUBLE PRECISION,
    rule5_total_time DOUBLE PRECISION,
    rule5_ratio_percentile DOUBLE PRECISION,
    rule5_tot_score_percentile DOUBLE PRECISION,
    rule5_tot_time_percentile DOUBLE PRECISION,
    PRIMARY KEY (student)
);