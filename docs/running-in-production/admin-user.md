# Admin User Setup

After setting up authentication we can elevate a user that's logged into the system to administrator status:

- Connect to the postgres database by running

  ```sh
  psql postgres
  ```

- Check the users table by running

  ```sql
  SELECT
    id,
    uid,
    uin,
    name
  FROM
    users;
  ```

  Which will display a table of users in the database:

  ```txt
  id |       uid       |    uin    |   name
  ---+-----------------+-----------+----------
   1 | dev@example.com | 000000000 | Dev User
  ```

- Add the desired user to the administrators table by running the following (substitute the `1` with the desired user's `id`):

  ```sql
  INSERT INTO
    administrators (user_id)
  VALUES
    (1);
  ```
