#!/bin/sh
psql postgres <<EOF
\dt
\d access_logs
\d administrators
\d alternative_groups
\d assessment_access_rules
\d assessment_instances
\d assessment_questions
\d assessment_score_logs
\d assessment_sets
\d assessment_state_logs
\d assessments
\d audit_logs
\d course_instance_access_rules
\d course_instances
\d course_permissions
\d enrollments
\d grading_jobs
\d instance_questions
\d job_sequences
\d jobs
\d last_accesses
\d pl_courses
\d question_score_logs
\d question_tags
\d questions
\d submissions
\d tags
\d topics
\d users
\d variant_view_logs
\d variants
\d zones
EOF
