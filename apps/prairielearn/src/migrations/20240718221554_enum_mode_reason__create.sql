CREATE TYPE enum_mode_reason AS ENUM(
  -- The user is in public mode.
  'Default',
  -- The user is in Exam mode because of a PrairieTest reservation.
  'PrairieTest',
  -- The user is in Exam mode because they're using a legacy exam mode network.
  'Network'
);
