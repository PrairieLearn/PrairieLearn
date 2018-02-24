/* From PS locations as of 2018-02-24 */

CREATE TABLE IF NOT EXISTS locations (
  location_id BIGSERIAL PRIMARY KEY,
  location_tag text NOT NULL,
  location_short text NOT NULL
);
