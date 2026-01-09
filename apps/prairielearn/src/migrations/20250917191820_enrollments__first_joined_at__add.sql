-- This is the first step in a multi-step migration to rename the joined_at column to first_joined_at.
ALTER TABLE enrollments
ADD COLUMN first_joined_at TIMESTAMP WITH TIME ZONE;
