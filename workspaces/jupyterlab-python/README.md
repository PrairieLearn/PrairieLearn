# workspace-jupyterlab-python

To automatically open a file on launch of this workspace, please use the `LAUNCH_FILE_NAME` environment variable in your `info.json` as shown in the example below.

```
"environment": {
      "LAUNCH_FILE_NAME": "some_file.ext"
    }
```

Replace `some_file.ext` with your file. It is expected that this file exists inside of the `/workspace` directory of the question. Please see the [workspaces documentation](https://prairielearn.readthedocs.io/en/latest/workspaces/) for more details on environment variable usage.