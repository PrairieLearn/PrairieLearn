CREATE OR REPLACE FUNCTION
  length_of_incorrect_streak (arr BOOLEAN[]) RETURNS integer AS $$
     DECLARE
       i INTEGER := 1;
     BEGIN
       LOOP
         EXIT WHEN arr[i] = TRUE OR (i > array_length(arr, 1)) OR arr[i] IS NULL;
         i := i + 1;
       END LOOP;
       RETURN i - 1;
     END;
  $$ LANGUAGE plpgsql;