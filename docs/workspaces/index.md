# Workspaces (Alpha release: NOT suitable for student use)

Workspaces allow students to work in persistent remote containers via in-browser frontends such as VS Code and JupyterLab. The remote containers are configured by instructors to provide custom, uniform environments per question. Workspace questions are integrated with the standard PrairieLearn autograding pipeline.

## Supported browsers

* [x] Chrome is supported
* [x] Firefox is supported
* [ ] Safari is NOT yet supported

## Setting up

### `info.json`

The question's `info.json` should contain a `workspaceOptions` dictionary:

* `image`: Dockerhub image serving the IDE and containing the desired compilers, debuggers, etc.
* `port`: port number used in the Docker image
* `home`: home directory in the Docker image
* `gradedFiles`: list of files or directories that will be copied for grading
* `args` (optional): command line arguments to pass to the Docker image
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

## Running locally (on Docker)

* First, create an empty directory to use to share job data between containers.

    * This can live anywhere, but needs to be created first and referenced in the docker launch command.
    * This command is copy-pastable for Windows PowerShell, MacOS, and Linux.

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

In Windows 10 (PowerShell), `cd` to your course directory and copy the following command **except with your own username** in `HOST_JOBS_DIR`:

```powershell
docker run -it --rm -p 3000:3000 `
  -v $HOME\pl_ag_jobs:/jobs `
  -e HOST_JOBS_DIR=/c/Users/Tim/pl_ag_jobs `
  -v /var/run/docker.sock:/var/run/docker.sock `
  prairielearn/prairielearn `
  /PrairieLearn/docker/start_workspace.sh
```

**Note the following about `HOST_JOBS_DIR` in PowerShell:**

    * Use Unix-style paths (i.e., use `/c/Users/Tim/pl_ag_jobs`, not `C:\Users\Tim\pl_ag_jobs`).
    * Use the full path rather than $HOME (i.e., use `/c/Users/Tim/pl_ag_jobs`, not `$HOME/pl_ag_jobs`).

### Windows errors and quirks

#### `exec user process caused "no such file or directory"`

This error occurs during grading as a result of an OS new-line incompatibility with the `entrypoint` script in the externally
graded question:

```sh
standard_init_linux.go:207: exec user process caused "no such file or directory"
```

One solution for this is to make a `.gitattributes` files in your PL repository with the line
`*.sh text eol=lf`. This tells the GitHub client to write the script files in native Linux
format instead of converting them for Windows (which breaks mapping them back into docker).
This mimics the [`.gitattributes` file in the main PrairieLearn repo](https://github.com/PrairieLearn/PrairieLearn/blob/master/.gitattributes).

#### `invalid mode: /grade`

This error occurs when `HOST_JOBS_DIR` cannot be accessed:

```sh
error: Error processing external grading job 1
error: handleGraderErrorUnable to launch Docker container for grading: (HTTP code 500) server error - invalid mode: /grade
```

1. Verify that the `pl_ag_jobs` directory was created successfully.
2. Verify the following quirks about `HOST_JOBS_DIR`:
    - Use Unix-style slashes even though you are using PowerShell (i.e., use `-e HOST_JOBS_DIR=/c/Users/Tim/pl_ag_jobs`, **not** `-e HOST_JOBS_DIR=C:\Users\Tim\pl_ag_jobs`).
    - Spell out the full path without using `$HOME` (i.e., use `-e HOST_JOBS_DIR=/c/Users/Tim/pl_ag_jobs`, **not** `-e HOST_JOBS_DIR=$HOME/pl_ag_jobs`).
3. Verify your Windows/Docker shared access:
    _ Redo Docker's access to `C:` drive (or whichever drive your course directory is on) by right-clicking the Docker "whale" icon in the taskbar > clicking "Settings" > unchecking `C:` drive > re-checking `C:` drive.
    - If still not working, restart Docker.
    - If still not working, restart Windows.
