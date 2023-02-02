# Workspaces

Workspaces allow students to work in persistent remote containers via in-browser frontends such as VS Code and JupyterLab. The remote containers are configured by instructors to provide custom, uniform environments per question. Workspace questions are integrated with the standard PrairieLearn autograding pipeline.

## Supported browsers

- [x] Chrome is supported
- [x] Firefox is supported
- [x] Safari is supported
- [x] Edge Chromium (version >= 79) is supported
- [ ] Edge Legacy (version < 79) is untested

## Directory structure

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

- `"singleVariant": true` will prevent student workspaces from resetting due to new variants being generated
  - Note that new variants will still be generated in `Staff view`
- `workspaceOptions` contains the following properties:
  - `image`: Docker Hub image serving the IDE and containing the desired compilers, debuggers, etc.
  - `port`: port number used by the workspace app inside the Docker image
  - `home`: home directory inside the Docker image -- this should match the running user's home directory specified by the image maintainer and can't be used (for example) to switch the running user or their home directory
  - `gradedFiles` (optional, default none): list of file paths (relative to the `home` path) that will be copied out of the workspace container for grading. Files can be in subdirectories, but the files must be explicitly listed (e.g. `dir/file.txt`) or use wildcards (e.g., `dir/*`). If a file is in a subdirectory, the relative path to the file will be reconstructed inside the autograder. Wildcards are allowed (e.g., you can specify `dir/*.c`) and will match any files in the workspace that match them. Paths with wildcards are considered optional. The following wildcards are supported:
    - `*` matches everything except path separators and hidden files (names starting with `.`).
    - `**` can be used to identify files in all subdirectories of the workspace (e.g., `**/*.py` will copy the files with `.py` extension in the home directory and in all its subdirectories).
    - `?` matches any single character except path separators.
    - `[seq]` matches any character in `seq`.
  - `args` (optional, default none): command line arguments to pass to the Docker image
  - `rewriteUrl` (optional, default true): if true, the URL will be rewritten such that the workspace container will see all requests as originating from /
  - `enableNetworking` (optional, default false): whether the workspace should be allowed to connect to the public internet. This is disabled by default to make secure, isolated execution the default behavior. This restriction is not enforced when running PrairieLearn in local development mode. It is strongly recommended to use the default (no networking) for exam questions, because network access can be used to enable cheating. Only enable networking for homework questions, and only if it is strictly required, for example for downloading data from the internet.
  - `environment` (optional, default `{}`): environment variables to set inside the workspace container. Set variables using `{"VAR": "value", ...}`, and unset variables using `{"VAR": null}` (no quotes around `null`).

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
        "image": "codercom/code-server",
        "port": 8080,
        "home": "/home/coder",
        "args": "--auth none"
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
        "image": "codercom/code-server",
        "port": 8080,
        "home": "/home/coder",
        "args": "--auth none",
        "gradedFiles": [
            "starter_code.h",
            "starter_code.c",
            "docs/*.txt"
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

### Creating files in the workspace home directory

Workspace questions can optionally include a `workspace/` subdirectory within the regular [PrairieLearn question directory structure](../question.md#directory-structure). If this `workspace/` subdirectory exists, its contents will be copied into the home directory of the student's workspace container, as configured in the `home` setting in `info.json`.

Questions using workspaces can also be randomized, i.e., include files that contain random and dynamic content. This is done using [the `server.py` file in the question directory](../question.md#question-serverpy). In addition to other random parameters that can be created for the question page itself, the `_workspace_files` parameter can also be set, containing an array of files to be created. Each element of the array must include a `name` property, containing the file name (which can include a path with directories), and either a `contents` property, containing the contents of the file, or a `questionFile` property, pointing to an existing file in a different location in the question directory. For example:

```py
def generate(data):

    # Generate 1000 random bytes
    random_binary = os.urandom(1000)
    # Generate 1000 random printable ASCII characters, ending with a line break
    random_text = "".join(random.choices(string.printable, k=1000)) + "\n"

    data["params"]["_workspace_files"] = [
        # By default, `contents` is interpreted as regular text
        {"name": "static.txt", "contents": "test file with data\n"},
        # The contents can be dynamic
        {"name": "dynamic.txt", "contents": random_text},
        # If the name contains a path, the necessary directories are created
        {"name": "path/with/long/file/name.txt", "contents": random_text},
        # Binary data must be encoded using hex or base64, and the encoding must be provided
        {
            "name": "binary1.bin",
            "contents": random_binary.hex(),
            "encoding": "hex",
        },
        {
            "name": "binary2.bin",
            "contents": base64.b64encode(random_binary).decode(),
            "encoding": "base64",
        },
        # A question file can also be added by using its path in the question instead of its contents
        {"name": "provided.txt", "questionFile": "clientFilesQuestion/provided.txt"},
    ]
```

By default, `contents` is expected to be a string in UTF-8 format. To provide binary content, the value must be encoded using base64 or hex, as shown in the example above. In this case, the `encoding` property must also be provided. Only one of `questionFile` and `contents` may be provided. If neither `questionFile` nor `contents` are provided, an empty file is created. If a file name is found in both the dynamic list above and in the `workspace/` directory, the dynamic content is used.

## Running locally (on Docker)

- First, create an empty directory to use to share job data between containers.

  - This can live anywhere, but needs to be created first and referenced in the `docker run` command.
  - This command is copy-pastable for Windows PowerShell, MacOS, and Linux.
  - **If you already created an external grader jobs directory, you can reuse the same one.**

```sh
mkdir "$HOME/pl_ag_jobs"
```

- Then, use one of the following `docker run` commands based on your platform.

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

In Windows 10/11 (PowerShell), `cd` to your course directory and copy the following command **but with your own username in `HOST_JOBS_DIR`**:

```powershell
docker run -it --rm -p 3000:3000 `
  -v "$PWD":/course `
  -v $HOME\pl_ag_jobs:/jobs `
  -e HOST_JOBS_DIR=/c/Users/Tim/pl_ag_jobs `
  -v /var/run/docker.sock:/var/run/docker.sock `
  prairielearn/prairielearn
```

- **Note** the following about `HOST_JOBS_DIR` in PowerShell:

  - Use Unix-style paths (i.e., use `/c/Users/Tim/pl_ag_jobs`, not `C:\Users\Tim\pl_ag_jobs`).
  - Use the full path rather than `$HOME` (i.e., use `/c/Users/Tim/pl_ag_jobs`, not `$HOME/pl_ag_jobs`).

- **Note** that `C:` must have shared access between Windows and Docker:

  - Right-click the Docker "whale" icon in the taskbar
  - Click "Settings"
  - Ensure `C:` is checked

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

## Developing with workspaces (in Docker)

For development, run the docker container as described in [Installing with local source code](../installingLocal.md) but also add the workspace-specific arguments described above to the docker command line. Inside the container, run:

```
make start-workspace-host
make start
```

For development it is helpful to run the above two commands in separate `tmux` windows. There is a `tmux` script in the container at `/PrairieLearn/tools/start_workspace_tmux.sh` that you might find useful.

## Permissions in production

When running a workspace container locally the user/group is the default setting for docker, which is typically root. In production, workspaces are run with user:group set to 1001:1001. If the workspace relies on root permissions (e.g., uses a port number below 1024) then it may work locally and fail in production. To test a workspace locally, run it like this:

```sh
docker run -it --rm -p HOST_PORT:CLIENT_PORT --user 1001:1001 IMAGE_NAME
```

For example, the [example JupyterLab workspace](https://us.prairielearn.com/pl/course/108/question/9045312/preview) using the [JupyterLab image](https://github.com/PrairieLearn/PrairieLearn/tree/master/workspaces/jupyterlab) uses port 8080 and so can be run successfully like this:

```
docker run -it --rm -p 8080:8080 --user 1001:1001 prairielearn/workspace-jupyterlab
```
