-- This trigger runs when we need to insert a score value into our assessment instance
-- There are several conditionals, such as checking whether session ID and course instance ID are matching
CREATE OR REPLACE FUNCTION insert_score_from_assessment_instances()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO PLR_live_session_credentials (points, session_id, duration, user_id, assessment_instance_id)
    SELECT
      NEW.points,
      PLR_live_session.id,
      NEW.duration,
      NEW.user_id,
      NEW.id
    FROM
      PLR_live_session
      INNER JOIN assessments ON PLR_live_session.course_instance_id = assessments.course_instance_id
    WHERE
      assessments.id = NEW.id;
  -- course_instance_id needs to exist within PLR_live_session
  -- assessment_id needs to exist within PLR_live_session
  -- Session_id from matching PLR_live_session table
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

--This trigger is what listens for inserts on the assessment instances table and calls our other trigger
CREATE TRIGGER trigger_insert_assessment_instances
AFTER INSERT ON assessment_instances
FOR EACH ROW
EXECUTE FUNCTION insert_score_from_assessment_instances();

