# How to Run
1. Put the "aws-config.json" file that contain your accessKeyId & secretAccessKey in the root directory.
2. Change the "workspaceS3Bucket" parameter in "./lib/config.js" to a bucket that you have access to. We will be storing code in a new folder called "workspace-0" in that bucket.
3. Run the following command:

```sh
$ cd workspace-host
$ aws s3 sync ./example-files/ s3://pl-workspace/workspace-0
$ node interface
```