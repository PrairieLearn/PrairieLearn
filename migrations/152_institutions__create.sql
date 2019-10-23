CREATE TABLE institutions (
    id bigserial PRIMARY KEY,
    institution TEXT NOT NULL,
    uid_pattern TEXT
);

CREATE INDEX IF NOT EXISTS institutions_institution_idx ON institutions(institution);

INSERT INTO institutions (institution, uid_pattern) VALUES
    ('UIUC', '%@illinois.edu'),
    ('ZJUI', '%@intl.zju.edu.cn'),
    ('gvsu.edu', '%@mail.gvsu.edu'),
    ('Any', '%');
