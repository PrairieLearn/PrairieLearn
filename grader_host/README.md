# PrairieGrader

[![Greenkeeper badge](https://badges.greenkeeper.io/PrairieLearn/PrairieGrader.svg)](https://greenkeeper.io/)

An executor for PrairieLearn external grading jobs.

## Using PrairieGrader

```sh
$ QUEUE_NAME=my_queue node index.js
```

PrairieGrader is configured via several environment variables:

* `QUEUE_NAME`: The AWS SQS queue to pull grading jobs from. If `QUEUE_URL` is not specified, SQS will be queried for the URL of the queue by this name when PrairieGrader starts up. Defaults to `grading`.
* `QUEUE_URL`: The URL of the AWS SQS queue to pull grading jobs from. If specified, `QUEUE_NAME` will not be used.
* `LOG_GROUP`: The name of the AWS CloudWatch log group to send logs to. The log group will be created if it does not yet exist. Defaults to `grading_debug`.

Like PrairieLearn, PrairieGrader will read AWS configuration from a `aws-config.json` file in the project root upon startup if it is present. Otherwise, it is assumed that AWS credentials can be obtained via [IAM Roles for EC2](http://docs.aws.amazon.com/AWSEC2/latest/UserGuide/iam-roles-for-amazon-ec2.html).
