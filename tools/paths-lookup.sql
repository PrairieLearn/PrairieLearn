-- BLOCK iqsearch
select
  plc.short_name,
  q.qid,
  q.type
from
  instance_questions iq
  join assessment_questions aq on (aq.id = iq.assessment_question_id)
  join questions q on (q.id = aq.question_id)
  join pl_courses plc on (plc.id = q.course_id)
where
  iq.id = $iq_id;
