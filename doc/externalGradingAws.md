# Setting up AWS to support External Grading

## Setting up PrairieLearn

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
    "externalGradingUseAws": true
}
```

## Setting up Batch

1. Visit [https://console.aws.amazon.com/batch/home?region=us-east-1#/wizard](https://console.aws.amazon.com/batch/home?region=us-east-1#/wizard)
2. Select "Using Amazon EC2" for "How would you like to run your job?"
3. Select "Create new job definition" and name it `grading-job-definition`
4. TODO: Select a job role that will give our containers permissions to use AWS APIs
5. Click "Next"
6. Accept all the defaults on the next page, but change the "Job queue name" at the bottom of the page to `grading-job-queue`. If you choose not to use that default name, make sure to specify the one you choose in `PrairieLearn/config.json`:

```json
{
    "externalGradingJobQueue": "my-custom-job-queue"
}
```

## Setting up S3

You'll need to create S3 buckets to hold jobs, results, and archives. If you're using the PrairieLearn AWS account, you can use the default bucket names in `PrairieLearn/lib/config.js`. Otherwise, you can override those bucket names to something of your choosing in `PrairieLearn/config.json`:

```json
{
    "externalGradingJobsS3Bucket": "mybucket.jobs",
    "externalGradingResultsS3Bucket": "mybucket.results",
    "externalGradingArchivesS3Bucket": "mybucket.archives"
}
```

## Setting up IAM roles

You'll need to configure an IAM role that will be provided to the containers running on Batch; this will let the containers use AWS resources. Currently, that role only needs one policy attached to it: `AmazonS3FullAccess`. This will allow the jobs to read to and write from S3. These permissions should be kept at a minimum to minimize the amount of damage a student could cause if they somehow managed to execute AWS commands inside the containers.

Once that role has been configured, get its `Role ARN` and add it to `PrairieLearn/config.json`:

```json
{
    "externalGradingJobRole": "arn:aws:iam::123456789:role/GradingContainer"
}
```

## Submitting an answer to an externally graded question

You must be in student mode for this to work. You also have to make at least one modification to the file if you're using the in-browser ACE editor; otherwise, a blank file will be submitted. This should be fixed in the future.

Support for externally graded file upload questions will be added soon.

## Running locally

If you're developing locally but are still using AWS infrastructure, you'll have to do a small workaround to grade questions. In production, the job running on Batch will call a webhook endpoint on PrairieLearn to notify that the job is done, but since it's non-trivial to expose that endpoint to AWS from localhost, you'll have to manually trigger the webhook.

In order to see when jobs finish, debug the output, and grab the CSRF token necessary to perform the callback, you can set up a [RequestBin](https://requestb.in/) to receive the `POST` from the Batch job. You can set that as the webhook callback URL with `externalGradingWebhookUrl` in `PrairieLearn/config.json`:

```json
{
    "externalGradingWebhookUrl": "https://requestb.in/1h4tqz81"
}
```

When the job completes, you'll be able to refresh the RequestBin page and see the results. To perform the callback yourself, you'll need two pieces of information from that page:

* The `X-Csrf-Token` header
* The `job_id` in the body JSON

Using a tool like `curl`, you can then perform the callback yourself, taking care to substitute `TOKEN` and `JOB_ID` with their appropriate values:

```sh
curl -k -H "Content-Type: application/json" -H "X-CSRF-Token: TOKEN" -X POST -d '{"event": "grading_result", "job_id": JOB_ID}' http://localhost:3000/pl/webhooks/grading
```

A few seconds later, you should be able to refresh the question page to see the results.
