# Workspaces

Workspaces allow students to work in persistent remote containers via in-browser frontends such as VS Code and JupyterLab. The remote containers are configured by instructors to provide custom, uniform environments per question. Workspace questions are integrated with the standard PrairieLearn autograding pipeline.

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
    +-- server.py             # secret server-side code for my_autograded_workspace (optional)
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
  - `gradedFiles` (optional, default none): list of file paths (relative to the `home` path) that will be copied out of the workspace container when saving a submission. These files can then be used for grading (either auto-grading or manual grading), previewed in the submission panel, and included in instructor submission downloads. Files can be in subdirectories, but the files must be explicitly listed (e.g. `dir/file.txt`) or use wildcards (e.g., `dir/*`). If a file is in a subdirectory, the relative path to the file will be reconstructed inside the autograder. Wildcards are allowed (e.g., you can specify `dir/*.c`) and will match any files in the workspace that match them. Paths with wildcards are considered optional. The following wildcards are supported:
    - `*` matches everything except path separators and hidden files (names starting with `.`).
    - `**` can be used to identify files in all subdirectories of the workspace (e.g., `**/*.py` will copy the files with `.py` extension in the home directory and in all its subdirectories).
    - `?` matches any single character except path separators.
    - `[seq]` matches any character in `seq`.
  - `args` (optional, default none): command line arguments to pass to the Docker image. It may be a string (e.g., `"--auth none"`) or an array of strings (e.g., `["--auth", "none"]`).
  - `rewriteUrl` (optional, default true): if true, the URL will be rewritten such that the workspace container will see all requests as originating from /
  - `enableNetworking` (optional, default false): whether the workspace should be allowed to connect to the public internet. This is disabled by default to make secure, isolated execution the default behavior. This restriction is not enforced when running PrairieLearn in local development mode. It is strongly recommended to use the default (no networking) for exam questions, because network access can be used to enable cheating. Only enable networking for homework questions, and only if it is strictly required, for example for downloading data from the internet.
  - `environment` (optional, default `{}`): environment variables to set inside the workspace container. Set variables using `{"VAR": "value", ...}`, and unset variables using `{"VAR": null}` (no quotes around `null`).

#### `info.json` for ungraded workspace

For an ungraded workspace, a full `info.json` file should look something like:

```json title="info.json"
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

```json title="info.json"
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

## Creating files in the workspace home directory

Workspace questions can optionally include a `workspace/` subdirectory within the regular [PrairieLearn question directory structure](../question/index.md#directory-structure). If this `workspace/` subdirectory exists, its contents will be copied into the home directory of the student's workspace container, as configured in the `home` setting in `info.json`.

Questions using workspaces can also be randomized, i.e., include files that contain random and dynamic content. This may be done in two ways: using Mustache-based template files or using [the `server.py` file in the question directory](../question/index.md#custom-generation-and-grading-serverpy). For template files, a workspace question can optionally include a `workspaceTemplates/` subdirectory within the regular question directory structure. The contents will be copied into the home directory of the student's workspace container, as with the `workspace/` directory. However, files within this directory may include Mustache tags (e.g., `{{params.value}}`), which will be replaced with the equivalent values set by `server.py`. File names may optionally include the `.mustache` extension, and the file will be renamed before being presented to the student. For example, if `server.py` sets `data["params"]["starting_value"]` to `17`, then if the file `main.py.mustache` inside `workspaceTemplates` has the following content:

```txt
# ...
starting_value = {{params.starting_value}}
# ...
```

Then a file with name `main.py` will be presented to the student, with the rendered content:

```py
# ...
starting_value = 17
# ...
```

For more fine-tuned randomized files, the `_workspace_files` parameter can also be set in `server.py`, containing an array of potentially dynamic files to be created in the workspace home directory. Each element of the array must include a `name` property, containing the file name (which can include a path with directories), and one of the following:

- a `contents` property, containing the contents of the file.
- a `questionFile` or `serverFilesCourseFile` property, pointing to an existing file in the question directory or the course's `serverFilesCourse` directory, respectively.

For example:

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
        # A file can also be added by using its path in serverFilesCourse
        {"name": "course.txt", "serverFilesCourseFile": "data.txt"},
        # To make an empty file, set `contents` to None or an empty string
        {"name": "empty.txt", "contents": None}
    ]
```

By default, `contents` is expected to be a string in UTF-8 format. To provide binary content, the value must be encoded using base64 or hex, as shown in the example above. In this case, the `encoding` property must also be provided. Exactly one of `questionFile`, `serverFilesCourseFile` or `contents` must be provided. If an empty file is expected, `contents` may be set to `None` or an empty string.

If a file name appears in multiple locations, the following precedence takes effect:

- Dynamic content from `_workspace_files` has the highest precedence;

- Files in the `workspaceTemplate/` directory are considered next;

- Files in the `workspace/` directory are considered last.

## Maintained workspace images

PrairieLearn provides and maintains the following workspace images:

- [`prairielearn/workspace-desktop`](https://github.com/PrairieLearn/PrairieLearn/tree/master/workspaces/desktop/): An Ubuntu 24.04 desktop
- [`prairielearn/workspace-jupyterlab-base`](https://github.com/PrairieLearn/PrairieLearn/tree/master/workspaces/jupyterlab-base/): JupyterLab without any additions (used to build the Python and R workspaces below)
- [`prairielearn/workspace-jupyterlab-python`](https://github.com/PrairieLearn/PrairieLearn/tree/master/workspaces/jupyterlab-python/): JupyterLab with Python 3.12
- [`prairielearn/workspace-jupyterlab-r`](https://github.com/PrairieLearn/PrairieLearn/tree/master/workspaces/jupyterlab-r/): JupyterLab with R 4.4
- [`prairielearn/workspace-rstudio`](https://github.com/PrairieLearn/PrairieLearn/tree/master/workspaces/rstudio/): RStudio with R version 4.4
- [`prairielearn/workspace-vscode-base`](https://github.com/PrairieLearn/PrairieLearn/tree/master/workspaces/vscode-base/): Basic VS Code without any additions (used to build the C/C++ and Python workspaces below)
- [`prairielearn/workspace-vscode-cpp`](https://github.com/PrairieLearn/PrairieLearn/tree/master/workspaces/vscode-cpp/): VS Code with C/C++ (using `gcc` and `g++`)
- [`prairielearn/workspace-vscode-java`](https://github.com/PrairieLearn/PrairieLearn/tree/master/workspaces/vscode-java/): VS Code with Java 21
- [`prairielearn/workspace-vscode-python`](https://github.com/PrairieLearn/PrairieLearn/tree/master/workspaces/vscode-python/): VS Code with Python 3.12
- [`prairielearn/workspace-xtermjs`](https://github.com/PrairieLearn/PrairieLearn/tree/master/workspaces/xtermjs/): Terminal emulator based on xterm.js

## Custom workspace images

You can build custom workspace images if you want to use a specific browser-based editor or if you need to install specific dependencies for use by students.

If you're using your own editor, you must ensure that it frequently autosaves any work and persists it to disk. We make every effort to ensure reliable execution of workspaces, but an occasional hardware failure or other issue may result in the unexpected termination of a workspace. Students will be able to quickly reboot their workspace to start it on a new underlying host, but their work may be lost if it isn't frequently and automatically saved by your workspace code.

## Running locally (on Docker)

In order to run workspaces in a local Docker environment, the `docker` command must include options that support the creation of local "sibling" containers. Detailed instructions on how to run Docker can be found in the [installation instructions](../installing.md#support-for-external-graders-and-workspaces).

## Developing with workspaces (in Docker)

For development, run the Docker container as described in [Installing with local source code](../dev-guide/installingLocal.md) but also add the workspace-specific arguments described above to the Docker command line. Inside the container, run:

```sh
make dev-all
```

Alternatively, you can run `make dev-workspace-host` and `make dev` independently.

## Permissions in production

When running a workspace container locally the user/group is the default setting for docker, which is typically root. In production, workspaces are run with user:group set to 1001:1001. If the workspace relies on root permissions (e.g., uses a port number below 1024) then it may work locally and fail in production. To test a workspace locally, run it like this:

```sh
docker run -it --rm -p HOST_PORT:CLIENT_PORT --user 1001:1001 IMAGE_NAME
```

For example, the [example JupyterLab workspace](https://us.prairielearn.com/pl/course/108/question/9045312/preview) using the [JupyterLab image](https://github.com/PrairieLearn/PrairieLearn/tree/master/workspaces/jupyterlab-python) uses port 8080 and so can be run successfully like this:

```sh
docker run -it --rm -p 8080:8080 --user 1001:1001 prairielearn/workspace-jupyterlab-python
```

## What to tell students

Instructors are strongly encouraged to allow students to get exposed to the PrairieLearn workspace environment, as well as specific workspaces to be used in a course, before any formal quizzes or exams. In particular, some workspaces may behave in ways that students need to be aware of. Instructors should provide students with instructions on:

- How to save their work and submit. Students should understand the difference between saving files inside the workspace environment and saving/submitting it on PrairieLearn itself. In particular, it should be clear to students that files saved inside the workspace are not automatically graded.

- Workspace-specific instructions. Different workspace environments may include different instructions for saving files, compiling, testing, and otherwise using the environment, as well as different directory structures that may be relevant in some contexts. Additionally, some workspaces may require additional actions in specific cases. For example, in Jupyter workspaces, students may need to know how to interrupt or restart the kernel.

- Expectations about workspace start times. In the worst case, a workspace may take several minutes as new machines are started and as images are pulled. This may be especially important in timed assessments, where the workspace starting time may affect the student's ability to complete their work.

## Troubleshooting workspace loading

A variety of issues can prevent a workspace from loading, including antivirus software, browser extensions, and network issues. If a workspace fails to load, the following steps may help you resolve the issue or provide more information to the PrairieLearn team:

- **Wait**: Wait for the loading progress indicator to reach 100%. This may take a few minutes if the workspace image is being pulled to a specific host for the first time. Even once a workspace's state changes to running, slow networks may result in a blank page for some time as the workspace's client-side assets load.
- **Reboot:** If the workspace still hasn't loaded after a few minutes, try rebooting the workspace by clicking the "Reboot" button in the top nav bar. As above, give the workspace several minutes to load.
- **Try another browser**: Some browser extensions may interfere with workspace loading. If you have another browser installed, try loading the workspace in that browser. Also consider trying a private/incognito window, which will disable most extensions.
- **Check the browser developer tools console tab**: Open the browser's developer tools and navigate to the "Console" tab. This may contain error messages that can help diagnose the issue.
  - On Chrome or Edge, you can open the developer tools by opening the three-dots menu in the top right corner, selecting "More tools", and then "Developer tools".
  - On Safari, you have to turn on the developer tools first. In the menu bar, click "Safari" ⇾ "Settings" ⇾ "Advanced" and check "Show features for web developers". You can then open the developer tools by selecting "Develop" ⇾ "Show Web Inspector".
  - On Firefox, you can open the developer tools by opening the Firefox menu in the top right corner, selecting "More tools", and then "Web Developer Tools".
- **Check the browser developer tools network tab**: Using the steps above, open the developer tools and navigate to the "Network" tab. This tab will show all network requests made by the browser, including those made by the workspace. Look for requests that are taking a long time or failing. You may need to reload the page to see all requests. If you want to provide the PrairieLearn team with more information, you can save the network log to a HAR file and send it. _Note: The HAR file may contain sensitive information, so be careful when sharing it. Only share it with individuals that you trust._
  - On Chrome or Edge, click the downward-facing arrow on the Network tab menu bar (it has a tooltip with the text "Export HAR..." when you hover over it) and save the HAR file.
  - On Safari, click the "Export" button in the top right corner and save the HAR file.
  - On Firefox, click the settings gear in the Network tab and select "Save all as HAR".
