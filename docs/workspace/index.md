# Workspaces

Workspaces allow students to work in persistent remote containers via in-browser frontends such as VS Code. The remote containers are configured by instructors to provide custom, uniform environments per question. Workspace questions are integrated with the standard PrairieLearn autograding pipeline.

## Setting up

### `info.json`

The question's `info.json` should contain a `workspaceOptions` dictionary:

* `image`: Dockerhub image that will be used to serve this question
* `port`: port number used in the Docker image
* `home`: home directory in the Docker image
* `gradedFiles`: list of files or directories that will be copied for grading
* `args` (optional): command line arguments to pass to the Docker
* `syncIgnore` (optional): list of files or directories that will be excluded from sync
* `urlRewrite` (optional): if true, the URL will be rewritten such that the workspace container will see all requests as originating from /

A full `info.json` file should look something like:

```json
{
    "uuid": "...",
    "title": "...",
    "topic": "...",
    "tags": [...],
    "type": "v3",
    "workspaceOptions": {
        "image": "prairielearn/workspace-vscode",
        "port": 8080,
        "home": "/home/coder",
        "args": "--auth none",
        "gradedFiles": [
            "starter_code.h",
            "starter_code.c"
        ],
        "syncIgnore": [
            ".local/share/code-server/"
        ]
    }
}
```
