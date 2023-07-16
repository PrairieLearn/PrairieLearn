CREATE OR REPLACE FUNCTION update_score_from_assessment_instances()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE PLR_live_session_credentials 
    SET points = NEW.points, duration = NEW.duration
    WHERE
        PLR_live_session_credentials.assessment_instance_id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_assessment_instances
AFTER UPDATE ON assessment_instances
FOR EACH ROW
EXECUTE FUNCTION update_score_from_assessment_instances();