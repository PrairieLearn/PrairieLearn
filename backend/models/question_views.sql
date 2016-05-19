CREATE TABLE IF NOT EXISTS question_views (
    id SERIAL PRIMARY KEY,
    question_instance_id INTEGER REFERENCES question_instances,
    access_id INTEGER UNIQUE REFERENCES accesses,
    open BOOLEAN,
    credit INTEGER
);
