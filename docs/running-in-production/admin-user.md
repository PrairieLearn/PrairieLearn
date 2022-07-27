## Admin User Setup

After setting up authentication we can elevate a user that's logged into the system to administrator status:

- Find the name of your running PrairieLearn container by running

```sh
docker ps
```

which will output multiple columns of information about your running container(s). Look for the `prairielearn/prairielearn` image and copy its corresponding name. For example, the name of the PrairieLearn container in this `docker ps` output is `upbeat_roentgen`:

```
CONTAINER ID  IMAGE                      COMMAND              CREATED      STATUS      PORTS                   NAMES
e0f522f41ea4  prairielearn/prairielearn  "/bin/sh -c /Prai…"  2 hours ago  Up 2 hours  0.0.0.0:3000->3000/tcp  upbeat_roentgen
```

- Open a shell in your PrairieLearn container by running

```sh
docker exec -it CONTAINER_NAME /bin/bash
```

- Connect to the postgres database by running

```sh
psql postgres
```

- Check the users table by running

```sh
SELECT * FROM users;
```

Which will display a table of users in the database:

```sh
 user_id |       uid        |    uin    |   name   | lti_course_instance_id | lti_user_id | lti_context_id | institution_id | deleted_at
---------+------------------+-----------+----------+------------------------+-------------+----------------+----------------+------------
       1 | dev@illinois.edu | 000000000 | Dev User |                        |             |                |              1 |
```

Add the desired user to the administrators table by running

```sh
INSERT INTO administrators (user_id) VALUES (user_id from users table);
```
