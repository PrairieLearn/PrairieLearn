# Workspaces (Alpha release: NOT suitable for student use)

Workspaces allow students to work in persistent remote containers via in-browser frontends such as VS Code and JupyterLab. The remote containers are configured by instructors to provide custom, uniform environments per question. Workspace questions are integrated with the standard PrairieLearn autograding pipeline.

## Supported browsers

* [x] Chrome is supported
* [x] Firefox is supported
* [x] Edge Chromium (version >= 79) is supported
* [ ] Edge Legacy (version < 79) is untested
* [x] Safari is supported

## Setting up

### `info.json`

The question's `info.json` should contain a `workspaceOptions` dictionary:

* `image`: Docker Hub image serving the IDE and containing the desired compilers, debuggers, etc.
* `port`: port number used by the workspace app inside the Docker image
* `home`: home directory inside the Docker image
* `gradedFiles`: list of files or directories that will be copied out of the workspace container for grading
* `args` (optional, default none): command line arguments to pass to the Docker image
* `syncIgnore` (optional, default none): list of files or directories that will be excluded from sync
* `urlRewrite` (optional, default true): if true, the URL will be rewritten such that the workspace container will see all requests as originating from /

A full `info.json` file for a workspace question should look something like:

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

## Running locally (on Docker)

* First, create an empty directory to use to share job data between containers.

    * This can live anywhere, but needs to be created first and referenced in the `docker run` command.
    * This command is copy-pastable for Windows PowerShell, MacOS, and Linux.
    * **If you already created an external grader jobs directory, you can reuse the same one.**

```sh
mkdir "$HOME/pl_ag_jobs"
```

* Then, use one of the following `docker run` commands based on your platform.

In MacOS, `cd` to your course directory and copy-paste the following command:

```sh
docker run -it --rm -p 3000:3000 \
  -v "$PWD":/course \
  -v "$HOME/pl_ag_jobs:/jobs" \
  -e HOST_JOBS_DIR="$HOME/pl_ag_jobs" \
  -v /var/run/docker.sock:/var/run/docker.sock \
  prairielearn/prairielearn \
  /PrairieLearn/docker/start_workspace.sh
```

In Linux, `cd` to your course directory and copy-paste the following command (same as the MacOS command but add the `--add-host` option):

```sh
docker run -it --rm -p 3000:3000 \
  -v "$PWD":/course \
  -v "$HOME/pl_ag_jobs:/jobs" \
  -e HOST_JOBS_DIR="$HOME/pl_ag_jobs" \
  -v /var/run/docker.sock:/var/run/docker.sock \
  --add-host=host.docker.internal:172.17.0.1 \ # this line is new vs MacOS
  prairielearn/prairielearn \
  /PrairieLearn/docker/start_workspace.sh
```

In Windows 10 (PowerShell), `cd` to your course directory and copy the following command **but with your own username in `HOST_JOBS_DIR`**:

```powershell
docker run -it --rm -p 3000:3000 `
  -v $HOME\pl_ag_jobs:/jobs `
  -e HOST_JOBS_DIR=/c/Users/Tim/pl_ag_jobs `
  -v /var/run/docker.sock:/var/run/docker.sock `
  prairielearn/prairielearn `
  /PrairieLearn/docker/start_workspace.sh
```

**Note** the following about `HOST_JOBS_DIR` in PowerShell:

    - Use Unix-style paths (i.e., use `/c/Users/Tim/pl_ag_jobs`, not `C:\Users\Tim\pl_ag_jobs`).
    - Use the full path rather than $HOME (i.e., use `/c/Users/Tim/pl_ag_jobs`, not `$HOME/pl_ag_jobs`).

**Note** that `C:` must have shared access between Windows and Docker:

    - Right-click the Docker "whale" icon in the taskbar
    - Click "Settings"
    - Ensure `C:` is checked
