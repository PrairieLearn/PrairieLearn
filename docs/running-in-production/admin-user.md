## Admin User Setup

After setting up authentication we can elevate a user that's logged into the system to administrator status:

- Connect to the postgres database by running

  ```sh
  psql postgres
  ```

- Check the users table by running

  ```sql
  SELECT
    *
  FROM
    users;
  ```

  Which will display a table of users in the database:

  ```txt
  user_id |       uid        |    uin    |   name   | lti_course_instance_id | lti_user_id | lti_context_id | institution_id | deleted_at
  ---------+------------------+-----------+----------+------------------------+-------------+----------------+----------------+------------
        1 | dev@illinois.edu | 000000000 | Dev User |                        |             |                |              1 |
  ```

- Add the desired user to the administrators table by running

  ```sql
  INSERT INTO
    administrators (user_id)
  VALUES
    (
      user_id
      from
        users table
    );
  ```
