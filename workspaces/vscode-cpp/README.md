# workspace-vscode-cpp

This image is based on [`prairielearn/workspace-vscode-base`](../vscode-base) with C/C++ tools from [`build-essential`](https://packages.ubuntu.com/noble/build-essential), including `g++` and `gcc`. See [the `prairielearn/workspace-vscode-base` documentation](../vscode-base/README.md) for recommended settings when using this workspace.

In order to give instructors some flexibility in specifying what is provided to students (or not), the image does not provide an automated launcher. If the instructor wants to provide students with the means to run/debug specific code, the following files may be provided in the workspace directory:

- `.vscode/tasks.json`: This file can be created to provide a compilation task to be executed before the code is launched. If a `Makefile` is provided, the content of this file can be configured as follows:

  ```json
  {
    "tasks": [
      {
        "type": "shell",
        "label": "Compilation",
        "command": "make"
      }
    ],
    "version": "2.0.0"
  }
  ```

  If compilation is expected to be done without `make` (e.g., with a longer `gcc` or `g++` command), the `"command"` argument should be replaced with the appropriate command.

- `.vscode/launch.json`: This file configures the Run and Debug options in the user interface. To use the provided codelldb extension, the content of this file can be configured as follows (assuming the compilation process creates an executable file named `main` in the workspace root directory):

  ```json
  {
    "version": "0.2.0",
    "configurations": [
      {
        "type": "lldb",
        "request": "launch",
        "name": "Launch",
        "program": "${workspaceFolder}/main",
        "args": [],
        "cwd": "${workspaceFolder}",
        "preLaunchTask": "Compilation"
      }
    ]
  }
  ```
