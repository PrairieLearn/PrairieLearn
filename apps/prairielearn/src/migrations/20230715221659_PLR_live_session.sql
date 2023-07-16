-- LIVE_SESSION
-- when a professor presses "start live session" for a certain quiz, it adds this
CREATE TABLE IF NOT EXISTS PLR_live_session (
    id SERIAL PRIMARY KEY,
    assess_id BIGINT NOT NULL,
    course_instance_id BIGINT NOT NULL
    -- FOREIGN KEY (assess_id) REFERENCES assessments(id)
);

-- LIVE_SESSION_CREDENTIALS
CREATE TABLE IF NOT EXISTS PLR_live_session_credentials (
    id SERIAL PRIMARY KEY,
    user_id INT NULL,
    session_id INT NOT NULL,
    time_submitted TIMESTAMP NOT NULL,
    points DOUBLE PRECISION DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES PLR_students (user_id),
    FOREIGN KEY (session_id) REFERENCES PLR_live_session (id)
);
