# pgadmin and postgres Workspace

This workspace provides a [pgadmin 4 8.14](https://www.pgadmin.org/docs/pgadmin4/8.14/index.html) frontend to a [postgresql 16](https://www.postgresql.org/docs/16/release-16.html) database for use in PrairieLearn. Once loaded, pgadmin will open and automatically connect to an empty database called `postgres`. You have a few options to create data inside for students.

1. **Not recommended:** At build of this image by including in the `/database` directory (this is empty due to make this a general image for all)
2. **Recommended:** By creating your own Dockerfile using this image as a base (see `/extensions` directory for an example)
3. Create using any regular pgadmin4 methods (queries, pg_restore, etc.)

#### Logging

This image will log all queries made by the student inside the `/pgdata/log` directory of the container. You can be use this to verify student work as needed but it is **not maintained across reboots**.

#### Additional Notes

- The `/database` directory will create the relevant database tables using either `.SQL` or `.dump` files. It is up to the end user to verify these are valid files.
- Autosaving is **not enabled** in this workspace. Make sure this is clear for students using this.
- No `postgresql` external grader is provided. You will need to create your own or build questions around the other autograders provided by the PrairieLearn team.
- Special thanks to [Eric](https://github.com/echuber2) for helping get this over the line for working in PrairieLearn.
