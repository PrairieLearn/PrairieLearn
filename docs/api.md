# API

PrairieLearn contains a limited API for use by instructors that allows programmatic access to assessments, assessment instances, and submissions.

## API Authentication

PrairieLearn uses personal access tokens for the API. To generate a personal access token, click on your name in the nav bar and click "Settings". Under the section entitled "Personal Access Tokens", you can generate tokens for yourself. These tokens give you all the permissions that your normal user account has.

Provide your token via the `Private-Token` header:

```sh
curl -H "Private-Token: TOKEN" https://us.prairielearn.com/pl/api/v1/<REST_OF_PATH>
```

## Endpoint HTTP methods

API endpoints require either a [`GET` request](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Methods/GET) or a [`POST` request](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Methods/POST). A `GET` request retrieves information from PrairieLearn, such as gradebook information. A `POST` request asks PrairieLearn to perform an action, such as syncing a course GitHub repository. For `GET` requests, you can follow the format in the above example.

Here is an example of using `curl` for a `POST` request:

```sh
curl -H "Private-Token: TOKEN" -X POST https://us.prairielearn.com/pl/api/v1/<REST_OF_PATH>
```

## Example access script

An example script that will download all API data for a course instance is at [`api_download.py`](https://github.com/PrairieLearn/PrairieLearn/blob/master/contrib/api_download.py). You can use it like this:

```sh
python api_download.py --token 9a6932a1-e356-4ddc-ad82-4cf30ad896ac --course-instance-id 29832 --output-dir tam212fa18
```

The `token` is your personal access token described above. The `course-instance-id` can be obtained by navigating to your course instance in the PrairieLearn web interface and extracting the ID from the URL.

## Endpoints

All API endpoints are located at `/pl/api/v1/`. If you're running on production PrairieLearn, that means the API is at <https://us.prairielearn.com/pl/api/v1>. If you're running it locally at port 3000, the API is accessible via <http://localhost:3000/pl/api/v1/>.

In the endpoint list below, path components starting with a colon like `:course_instance_id` should be replaced with the integer IDs.

### Course instances

#### Get single course instance

```text
GET /pl/api/v1/course_instances/:course_instance_id
```

#### Get gradebook for course instance

```text
GET /pl/api/v1/course_instances/:course_instance_id/gradebook
```

#### Get access rules for course instance

```text
GET /pl/api/v1/course_instances/:course_instance_id/course_instance_access_rules
```

#### List assessments for course instance

```text
GET /pl/api/v1/course_instances/:course_instance_id/assessments
```

### Assessments

#### Get single assessment

```text
GET /pl/api/v1/course_instances/:course_instance_id/assessments/:assessment_id
```

#### List access rules for assessment

```text
GET /pl/api/v1/course_instances/:course_instance_id/assessments/:assessment_id/assessment_access_rules
```

#### List assessment instances for assessment

```text
GET /pl/api/v1/course_instances/:course_instance_id/assessments/:assessment_id/assessment_instances
```

### Assessment instances

#### Get single assessment instance

```text
GET /pl/api/v1/course_instances/:course_instance_id/assessment_instances/:assessment_instance_id
```

#### List instance questions for assessment instance

```text
GET /pl/api/v1/course_instances/:course_instance_id/assessment_instances/:assessment_instance_id/instance_questions
```

#### List submissions for assessment instance

```text
GET /pl/api/v1/course_instances/:course_instance_id/assessment_instances/:assessment_instance_id/submissions
```

#### Get event log for assessment instance

```text
GET /pl/api/v1/course_instances/:course_instance_id/assessment_instances/:assessment_instance_id/log
```

### Submissions

#### Get single submission

```text
GET /pl/api/v1/course_instances/:course_instance_id/submissions/:submission_id
```

### Course sync

#### Start a course sync

```text
POST /pl/api/v1/course/:course_id/sync
```

Returns a `job_sequence_id` that can be used to check on the sync job's status.

#### Check course sync status

```text
GET /pl/api/v1/course/:course_id/sync/:job_sequence_id
```

Returns the status and output of the sync job.

### Course issues

#### List course issues

```text
GET /pl/api/v1/course/:course_id/issues
```

Returns the course-caused issues that have been reported in this course, ordered by date descending. Only issues with `course_caused = true` are exposed (the same filter the instructor issues page uses by default).

Each result includes the issue metadata, the reporting user (UID, name, email), and the question / assessment / course-instance the issue was filed against. The large `system_data` and `course_data` JSONB blobs are omitted from the list response — fetch them via the single-issue endpoint below if needed.

Supported query parameters (all optional):

| Parameter            | Type      | Description                                                                    |
| -------------------- | --------- | ------------------------------------------------------------------------------ |
| `open`               | `boolean` | Only return issues with the given open/closed state. `true` or `false`.        |
| `manually_reported`  | `boolean` | Only return issues that were (or were not) manually reported by a student.     |
| `since`              | ISO 8601  | Only return issues whose `date` is at or after this timestamp.                 |

Requires course editor permissions (the same access level as the existing `POST /sync` endpoint).

#### Get single course issue

```text
GET /pl/api/v1/course/:course_id/issues/:issue_id
```

Returns the same fields as the list endpoint plus `system_data` and `course_data` (the JSONB blobs containing stack traces and variant params). Returns 404 if the issue does not exist, does not belong to the given course, or is not course-caused.

#### Open or close a course issue

```text
PATCH /pl/api/v1/course/:course_id/issues/:issue_id
```

Request body (JSON):

```json
{ "open": false }
```

Toggles the `open` field of the given issue. The change is recorded in `audit_logs` attributed to the API token's user, identical to closing the issue from the instructor UI. Idempotent: PATCHing `{"open": false}` on an already-closed issue is a no-op (200). Returns the updated issue in the same shape as the single-issue GET. 400 if the body is malformed, 403 if the issue does not exist in the given course or is not course-caused.
