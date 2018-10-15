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

The response will look like the following:

```
[
  {
    "uid": "dev@illinois.edu",
    "name": "Dev User",
    "role": "Instructor",
    "assessments": [
      {
        "label": "HW1",
        "score_perc": 7.69230769230769,
        "max_points": 104,
        "points": 8,
        "start_date": "2018-09-17T21:57:17.394633+00:00",
        "duration_secs": 106.677605,
        "last_submission_date": "2018-09-18T16:54:21.159511+00:00",
        "assessment_instance_id": 1
      },
      {
        "label": "HW2",
        "score_perc": null,
        "max_points": null,
        "points": null,
        "start_date": null,
        "duration_secs": null,
        "last_submission_date": null,
        "assessment_instance_id": null
      }
    ]
  }
]
```

Note how all the fields in HW2 are null: this indicates that a student has not
yet started the given assessment.
