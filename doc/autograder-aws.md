# Setting up the Autograder on AWS

## Creating a Job

1. Visit [https://console.aws.amazon.com/batch/home?region=us-east-1#/wizard](https://console.aws.amazon.com/batch/home?region=us-east-1#/wizard)
2. Select "Using Amazon EC2" for "How would you like to run your job?"
3. Select "Create new job definition" and name it `autograder-job-definition`
4. TODO: Select a job role that will give our containers permissions to use AWS APIs
5. Click "Next"
6. Accept all the defaults on the next page, but change the "Job queue name" at the bottom of the page to `autograder-job-queue`
