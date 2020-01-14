CREATE TABLE announcements (
    id bigserial PRIMARY KEY,
    uuid uuid NOT NULL UNIQUE,
    directory text NOT NULL,
    date timestamptz NOT NULL DEFAULT now(),
    title text NOT NULL,
    for_students boolean NOT NULL DEFAULT FALSE,
    order_by integer NOT NULL DEFAULT 0
);

CREATE TABLE announcement_notifications (
    id bigserial PRIMARY KEY,
    announcement_id bigint NOT NULL REFERENCES announcements(id) ON DELETE CASCADE ON UPDATE CASCADE,
    user_id bigint NOT NULL REFERENCES users(user_id) ON DELETE CASCADE ON UPDATE CASCADE,
    UNIQUE (user_id, announcement_id)
);
