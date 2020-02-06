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
curl -H "Private-Token: TOKEN" https://prairielearn.engr.illinois.edu/pl/api/v1/<REST_OF_PATH>
```

You can also provide the token via a `private_token` query parameter:

```sh
curl https://prairielearn.engr.illinois.edu/pl/api/v1/<REST_OF_PATH>?private_token=TOKEN
```

## Example usage

### Python example script

An example script that will download all API data for a course instance is at <https://github.com/PrairieLearn/PrairieLearn/blob/master/tools/api_download.py>. You can use it like this:

```sh
python api_download.py --token 9a6932a1-e356-4ddc-ad82-4cf30ad896ac --course-instance-id 29832 --output-dir tam212fa18
```

The `token` is your personal access token described above. The `course-instance-id` can be obtained by navigating to your course instance in the PrairieLearn web interface and extracting the ID from the URL.

### R package

All endpoints listed below are implemented in the [`pli`](https://github.com/illinois-r/pli) _R_ package. 
The package provides a convenient way for downloading and importing PrairieLearn data into _R_ using the API. 
Similar to the python example, one needs to obtain `course-instance-id` from the URL inside PrairieLearn web interface.
Unlike the  example python script, the `token` value generated must be stored in the `~/.Renviron` file under the
environment variable `PRAIRIELEARN_API_TOKEN`.

A similar approach can be had with: 

```r
# Download and install pli from GitHub
if(!requireNamespace("devtools")) { install.packages("devtools") }
devtools::install_github("illinois-r/pli")

# Load the R package
library("pli")

# Obtain from the URL
course_instance_id = 54777

# Download the entire gradebook
grades = pl_course_gradebook(course_instance_id)

# Get an overview of all assessments
assessments = pl_assessment_list(course_instance_id)
```

## Endpoints

All API endpoints are located at `/pl/api/v1/`. If you're running on
production PraririeLearn, that means the API is at
https://prairielearn.engr.illinois.edu/pl/api/v1. If you're running it locally
at port 3000, the API is accessible via http://localhost:3000/pl/api/v1/.

In the endpoint list below, path components starting with a colon like
`:course_instance_id` should be replaced with the integer IDs.

* **Gradebook:**
    - `/pl/api/v1/course_instances/:course_instance_id/gradebook`
    - All of the data available in the course gradebook, with one entry per user containing summary data on all assessments.

* **Assessments list:**
    - `/pl/api/v1/course_instances/:course_instance_id/assessments`
    - All assessments in the course instance.

* **Single assessment:**
    - `/pl/api/v1/course_instances/:course_instance_id/assessments/:assessment_id`
    - One specific assessment.

* **Assessment instances list:**
    - `/pl/api/v1/course_instances/:course_instance_id/assessments/:assessment_id/assessment_instances`
    - All assessment instances for a given assessment.

* **One assessment instance:**
    - `/pl/api/v1/course_instances/:course_instance_id/assessment_instances/:assessment_instance_id`
    - One specific assessment instance.

* **Submissions list:**
    - `/pl/api/v1/course_instances/:course_instance_id/assessment_instances/:assessment_instance_id/submissions`
    - All submissions for a given assessment instance.

* **One submission:**
    - `/pl/api/v1/course_instances/:course_instance_id/submissions/:submission_id`
    - One specific submission.
