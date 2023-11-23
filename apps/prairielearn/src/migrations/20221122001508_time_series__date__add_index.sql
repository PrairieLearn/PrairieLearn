-- prairielearn:migrations NO TRANSACTION
CREATE INDEX CONCURRENTLY time_series_date_idx ON time_series (date);
