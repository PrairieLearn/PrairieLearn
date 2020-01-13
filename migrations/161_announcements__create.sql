CREATE TABLE announcements (
    id bigserial PRIMARY KEY,
    uuid uuid NOT NULL UNIQUE,
    directory text NOT NULL,
    date timestamptz NOT NULL DEFAULT now(),
    title text NOT NULL,
    for_students boolean NOT NULL DEFAULT FALSE
);

CREATE TABLE announcement_notifications (
    id bigserial PRIMARY KEY,
    announcement_id bigint NOT NULL REFERENCES announcements(id) ON DELETE SET NULL ON UPDATE CASCADE,
    user_id bigint NOT NULL REFERENCES users(user_id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX announcement_notifications_user_id_idx ON announcement_notifications (user_id);
