#!/bin/sh
psql database <<EOF
\dt
\d access_rules
\d course_instances
\d courses
\d enrollments
\d questions
\d semesters
\d test_instances
\d test_questions
\d test_sets
\d test_states
\d tests
\d topics
\d users
\d zones
EOF
