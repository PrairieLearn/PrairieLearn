# How to Run

1. Put the `aws-config.json` file that contain your `accessKeyId` and `secretAccessKey` in the main PL directory. See https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/loading-node-credentials-json-file.html for the format of this file, but note that it must be called `aws-config.json` for PL.

2. Change the `workspaceS3Bucket` parameter in PL's `config.json` to a bucket that you have access to in your AWS account. We will be storing code in a new folder called `workspace-0` in that bucket.

3. Run the following command from within the main PL directory:

```sh
$ cd workspace_host
$ aws s3 sync ./example-files/ s3://YOUR_BUCKET_NAME/workspace-0
$ cd ..
$ node workspace_host/interface
```

4. If you are running PL natively (outside of docker), in PL's `config.json` set `"workspaceLocalhost": "http://localhost:8081/"`.

5. Run PL, either inside docker or natively. Navigate to `exampleCourse -> Questions -> Workspace demo` and click the `Open workspace` button.
