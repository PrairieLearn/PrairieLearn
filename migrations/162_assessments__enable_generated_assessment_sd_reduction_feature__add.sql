ALTER TABLE assessments ADD generated_assessment_sd_reduction_feature_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE assessments DROP enable_generated_assessment_sd_reduction_feature;