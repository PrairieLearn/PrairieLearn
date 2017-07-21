-- BLOCK valid_plps_all
select
tid, course_instance_id, assessment_id, aar.id AS aar_id, c.course_id, exam_id, exam_string, aar.start_date, aar.end_date, e.first_date, e.last_date
from
    courses AS c
    join exams AS e USING(course_id)
    join course_instances AS ci ON (ci.course_id = c.pl_course_id)
    JOIN assessments AS a ON (a.course_instance_id = ci.id)
    JOIN assessment_access_rules AS aar ON (aar.assessment_id = a.id and aar.mode = 'Exam')
WHERE
    c.pl_course_id = $plc_id
    and tstzrange(aar.start_date, aar.end_date, '[]') @> 
        tstzrange((testing_boundaries_by_date(e.first_date)).starting,
                  (testing_boundaries_by_date(e.last_date)).ending, '[]')
;

-- BLOCK valid_plps_courseid
select
tid, course_instance_id, assessment_id, aar.id AS aar_id, c.course_id, exam_id, exam_string, aar.start_date, aar.end_date, e.first_date, e.last_date
from
    courses AS c
    join exams AS e USING(course_id)
    join course_instances AS ci ON (ci.course_id = c.pl_course_id)
    JOIN assessments AS a ON (a.course_instance_id = ci.id)
    JOIN assessment_access_rules AS aar ON (aar.assessment_id = a.id and aar.mode = 'Exam')
WHERE
    c.course_id = $course_id
    and c.pl_course_id = $plc_id
    and tstzrange(aar.start_date, aar.end_date, '[]') @>
        tstzrange((testing_boundaries_by_date(e.first_date)).starting,
                  (testing_boundaries_by_date(e.last_date)).ending, '[]')
;

-- BLOCK valid_plps_aid
select
tid, course_instance_id, assessment_id, aar.id AS aar_id, c.course_id, exam_id, exam_string, aar.start_date, aar.end_date, e.first_date, e.last_date
from
    courses AS c
    join exams AS e USING(course_id)
    join course_instances AS ci ON (ci.course_id = c.pl_course_id)
    JOIN assessments AS a ON (a.course_instance_id = ci.id AND a.id = $a_id)
    JOIN assessment_access_rules AS aar ON (aar.assessment_id = a.id and aar.mode = 'Exam')
WHERE
    c.pl_course_id = $plc_id
    and tstzrange(aar.start_date, aar.end_date, '[]') @>
        tstzrange((testing_boundaries_by_date(e.first_date)).starting,
                  (testing_boundaries_by_date(e.last_date)).ending, '[]')
;

-- BLOCK courseids_by_plcid
select
    array_agg(course_id) AS course_ids
FROM
    courses AS c
WHERE
    c.pl_course_id = $pl_course_id
;
