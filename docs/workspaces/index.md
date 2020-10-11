# Workspaces

Workspaces allow students to work in persistent remote containers via in-browser frontends such as VS Code and JupyterLab. The remote containers are configured by instructors to provide custom, uniform environments per question. Workspace questions are integrated with the standard PrairieLearn autograding pipeline.

## Supported browsers

* [x] Chrome is supported
* [x] Firefox is supported
* [x] Safari is supported
* [x] Edge Chromium (version >= 79) is supported
* [ ] Edge Legacy (version < 79) is untested

## Directory structure

Workspace questions can optionally include a `workspace/` subdirectory within the regular [PrairieLearn question directory structure](../question.md#directory-structure). If this `workspace/` subdirectory exists, its contents will be copied into the home directory of the student's workspace container.

```text
questions
|
+-- my_ungraded_workspace     # for an ungraded workspace question
|   +-- info.json             # metadata for my_ungraded_workspace
|   +-- question.html         # HTML template for my_ungraded_workspace
|   +-- server.py             # secret server-side code for my_ungraded_workspace (optional)
|   |
|   +-- clientFilesQuestion   # files accessible to the client web browser (optional)
|   |   `-- fig1.png
|   |
|   `-- workspace             # copied into the student's workspace container home dir (optional)
|       +-- .bashrc
|       +-- starter_code.h
|       `-- starter_code.c
|
`-- my_autograded_workspace   # for an externally graded workspace question
    +-- info.json             # metadata for my_autograded_workspace
    +-- question.html         # HTML template for my_autograded_workspace
    +-- server.py             # secret server-side code for my_ungraded_workspace (optional)
    |
    +-- clientFilesQuestion   # files accessible to the client web browser (optional)
    |   `-- fig1.png
    |
    +-- tests                 # external grading files (see other doc)
    |   +-- correct_answer.c
    |   `-- test_run.py
    |
    `-- workspace             # copied into the student's workspace container home dir (optional)
        +-- .bashrc
        +-- starter_code.h
        `-- starter_code.c
```

## Setting up

### `info.json`

The question's `info.json` should set the `singleVariant` and `workspaceOptions` properties:

* `"singleVariant": true` will prevent student workspaces from resetting due to new variants being generated
    * Note that new variants will still be generated in `Instructor view`
* `workspaceOptions` contains the following properties:
    * `image`: Docker Hub image serving the IDE and containing the desired compilers, debuggers, etc.
    * `port`: port number used by the workspace app inside the Docker image
    * `home`: home directory inside the Docker image -- this should match the running user's home directory specified by the image maintainer and can't be used (for example) to switch the running user or their home directory
    * `gradedFiles` (optional, default none): list of files or directories that will be copied out of the workspace container for grading
    * `args` (optional, default none): command line arguments to pass to the Docker image
    * `syncIgnore` (optional, default none): list of files or directories that will be excluded from sync
    * `urlRewrite` (optional, default true): if true, the URL will be rewritten such that the workspace container will see all requests as originating from /

#### `info.json` for ungraded workspace

For an ungraded workspace, a full `info.json` file should look something like:

```json
{
    "uuid": "...",
    "title": "...",
    "topic": "...",
    "tags": [...],
    "type": "v3",
    "singleVariant": true,
    "workspaceOptions": {
        "image": "prairielearn/workspace-vscode",
        "port": 8080,
        "home": "/home/coder",
        "args": "--auth none",
        "syncIgnore": [
            ".local/share/code-server/"
        ]
    }
}
```

#### `info.json` for externally graded workspace

For an externally graded workspace, a full `info.json` file should look something like:

```json
{
    "uuid": "...",
    "title": "...",
    "topic": "...",
    "tags": [...],
    "type": "v3",
    "singleVariant": true,
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
    },
    "gradingMethod": "External",
    "externalGradingOptions": {
        "enabled": true,
        "image": "...",
        "entrypoint": "...",
        "timeout": 20
    }
}
```

### `question.html`

The `Open workspace` button should be included in all workspace questions by using the workspace element `<pl-workspace>`.

#### `question.html` for ungraded workspace

For an ungraded workspace, a minimal `question.html` should look something like:

```html
<pl-question-panel>
  This is a minimal workspace question.
  <pl-workspace></pl-workspace>
</pl-question-panel>
```

#### `question.html` for externally graded workspace

For an externally graded workspace, the workspace submission panel `<pl-submission-panel>` should include the file preview element `<pl-file-preview>`. This will enable students not only to preview submitted files but also to receive file submission error messages.

A minimal `question.html` for an externally graded workspace should look something like:

```html
<pl-question-panel>
  This is a minimal workspace question with external grading.
  <pl-external-grader-variables params-name="names_from_user"></pl-external-grader-variables>
  <pl-workspace></pl-workspace>
</pl-question-panel>

<pl-submission-panel>
  <pl-external-grader-results></pl-external-grader-results>
  <pl-file-preview></pl-file-preview>
</pl-submission-panel>
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
  prairielearn/prairielearn
```

In Linux, `cd` to your course directory and copy-paste the following command (same as the MacOS command but add the `--add-host` option):

```sh
docker run -it --rm -p 3000:3000 \
  -v "$PWD":/course \
  -v "$HOME/pl_ag_jobs:/jobs" \
  -e HOST_JOBS_DIR="$HOME/pl_ag_jobs" \
  -v /var/run/docker.sock:/var/run/docker.sock \
  --add-host=host.docker.internal:172.17.0.1 `# this line is new vs MacOS` \
  prairielearn/prairielearn
```

In Windows 10 (PowerShell), `cd` to your course directory and copy the following command **but with your own username in `HOST_JOBS_DIR`**:

```powershell
docker run -it --rm -p 3000:3000 `
  -v $HOME\pl_ag_jobs:/jobs `
  -e HOST_JOBS_DIR=/c/Users/Tim/pl_ag_jobs `
  -v /var/run/docker.sock:/var/run/docker.sock `
  prairielearn/prairielearn
```

* **Note** the following about `HOST_JOBS_DIR` in PowerShell:

    * Use Unix-style paths (i.e., use `/c/Users/Tim/pl_ag_jobs`, not `C:\Users\Tim\pl_ag_jobs`).
    * Use the full path rather than `$HOME` (i.e., use `/c/Users/Tim/pl_ag_jobs`, not `$HOME/pl_ag_jobs`).

* **Note** that `C:` must have shared access between Windows and Docker:

    * Right-click the Docker "whale" icon in the taskbar
    * Click "Settings"
    * Ensure `C:` is checked

If you are calling docker [from a WSL2 container](../installing/#running-prairielearn-from-a-wsl2-instance), you can use the following command:

```sh
docker run -it --rm -p 3000:3000 \
    -v "$PWD":/course \
    -v $HOME/pl_ag_jobs:/jobs \
    -e HOST_JOBS_DIR=$HOME/pl_ag_jobs \
    -v /var/run/docker.sock:/var/run/docker.sock \
    --add-host=host.docker.internal:172.17.0.1 \
    prairielearn/prairielearn
```

Note that in this case, the `$HOME/pl_ag_jobs` folder is created inside the WSL2 instance, not on the host. This can mitigate issues with mode/permissions in external grader instances, as the jobs are created in a Linux environment that allows non-executable files.


#### Developing with workspaces

For development, run the docker command with a final extra argument of `/PrairieLearn/docker/start_workspace.sh` to load PL and the workspace host interface in separate tmux panes.

## Running locally (natively, not on Docker)

Set these variables in your `config.json`:

* `workspaceJobsDirectory`
* `workspaceMainZipsDirectory`
* `workspaceHostZipsDirectory`
