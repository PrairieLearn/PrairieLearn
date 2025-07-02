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
