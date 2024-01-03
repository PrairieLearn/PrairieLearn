CREATE TABLE time_series (
  id bigserial PRIMARY KEY,
  date timestamp with time zone NOT NULL DEFAULT now(),
  name text NOT NULL,
  value double precision NOT NULL
);

CREATE INDEX time_series_name_date_idx ON time_series (name, date);
