# Setting up the Autograder on AWS

## Local Setup

Create the file `PrairieLearn/aws-config.json` containing:

```json
{
    "accessKeyId": "XXXXXXXXXXXXXXXXXXXX",
    "secretAccessKey": "yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy",
    "region": "us-east-1",
    "sslEnabled": true
}
```

Edit `PrairieLearn/config.json` to set:

```json
{
    "autograderUseAws": true
}
```

## Setting up Batch

1. Visit [https://console.aws.amazon.com/batch/home?region=us-east-1#/wizard](https://console.aws.amazon.com/batch/home?region=us-east-1#/wizard)
2. Select "Using Amazon EC2" for "How would you like to run your job?"
3. Select "Create new job definition" and name it `autograder-job-definition`
4. TODO: Select a job role that will give our containers permissions to use AWS APIs
5. Click "Next"
6. Accept all the defaults on the next page, but change the "Job queue name" at the bottom of the page to `autograder-job-queue`

## Setting up S3

You'll need to create S3 buckets to hold jobs, results, and archives. If you're using the PrairieLearn AWS account, you can use the default bucket names in `PrairieLearn/lib/config.js`. Otherwise, you can override those bucket names to something of your choosing in `PrairieLearn/config.json`.

## Submitting an answer to an autograded question

You must be in student mode for this to work. You also have to make at least one modification to the file if you're using the in-browser ACE editor; otherwise, a blank file will be submitted. This should be fixed in the future.

Support for autograded file upload questions will be added soon.

## Running locally

If you're developing locally but are still using AWS infrastructure, you'll have to do a small workaround to grade questions. In production, the job running on Batch will call a webhook endpoint on PrairieLearn to notify that the job is done, but since it's non-trivial to expose that endpoint to AWS from localhost, you'll have to manually trigger the webhook.

In order to see when jobs finish, debug the output, and grab the CSRF token necessary to perform the callback, you can set up a [RequestBin](https://requestb.in/) to receive the `POST` from the Batch job. You can set that as the webhook callback URL with `autograderWebhookUrl` in `PrairieLearn/config.json`.

When the job completes, you'll be able to refresh the RequestBin page and see the results. To perform the callback yourself, you'll need two pieces of information from that page:

* The `X-Csrf-Token` header
* The `job_id` in the body JSON

Using a tool like `curl`, you can then perform the callback yourself, taking care to substitute `TOKEN` and `JOB_ID` with their appropriate values:

```
curl -k -H "Content-Type: application/json" -H "X-CSRF-Token: TOKEN" -X POST -d '{"event": "autograder_result", "job_id": JOB_ID}' http://localhost:3000/pl/webhooks/autograder
```

A few seconds later, you should be able to refresh the question page to see the results.
