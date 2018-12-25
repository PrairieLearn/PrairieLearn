# API

PrairieLearn contains a limited read-only API for use by instructors that
allows programmatic access to assessments, assessment instances, and
submissions.

## API Authentication

PrairieLearn uses personal access tokens for the API. To generate a personal
access token, click on your name in the nav bar and click "Settings". Under
the section entitled "Personal Access Tokens", you can generate tokens for
yourself. These tokens give you all the permissions that your normal user
account has.

You can provide your token via the `Private-Token` header:

```sh
curl -H "Private-Token: TOKEN" https://prairielearn.engr.illinois.edu/pl/api/v1
```

You can also provide the token via a `private_token` query parameter:

```sh
curl https://prairielearn.engr.illinois.edu/pl/api/v1?private_token=TOKEN
```

## Example access script

An example script that will download all API data for a course instance is at `https://github.com/PrairieLearn/PrairieLearn/blob/master/tools/api_download.py`. You can use it like this:

```
python api_download.py --token 9a6932a1-e356-4ddc-ad82-4cf30ad896ac --course-instance-id 29832 --output-dir tam212fa18
```

The `token` is your personal access token described above. The `course-instance-id` can be obtained by navigating to your course instance in the PrairieLearn web interface and extracting the ID from the URL.

## Endpoints

All API endpoints are located at `/pl/api/v1/`. If you're running on
production PraririeLearn, that means the API is at
https://prairielearn.engr.illinois.edu/pl/api/v1. If you're running it locally
at port 3000, the API is accessible via http://localhost:3000/pl/api/v1/.

### Assessments

View all assessments for a particular course:

```
GET /course_instances/:course_instance_id/assessments
```

View all assessment instances for a particular assessment:

```
GET /course_instances/:course_instance_id/assessments/:assessment_id/assessment_instances
```

### Assessment instances

View all submissions for a particular assessment instance:

```
GET /course_instances/:course_instance_id/assessment_instances/:assessment_instance_id/submissions
```

### Gradebook

This endpoint includes all of the data available in the course gradebook,
including some additional information like points, start dates, durations,
and the time of the last submission.

```
GET /course_instances/:course_instance_id/gradebook
```
