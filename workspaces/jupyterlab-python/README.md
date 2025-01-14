# workspace-jupyterlab-python

To automatically open a file when the workspace is started, set the `LAUNCH_FILE_NAME` environment variable in your question's `info.json`:

```json
{
  "workspaceOptions": {
    "image": "prairielearn/workspace-jupyterlab-python",
    "environment": {
      "LAUNCH_FILE_NAME": "some_file.ext"
    }
  }
}
```

Replace `some_file.ext` with your file. It is expected that this file exists inside of the `/workspace` directory of the question. See the [workspaces documentation](https://prairielearn.readthedocs.io/en/latest/workspaces/) for more details on environment variable usage.
