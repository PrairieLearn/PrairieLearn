# workspace-vscode-java

This image is based on [`prairielearn/workspace-vscode-base`](../vscode-base) with support for Java development. See [the `prairielearn/workspace-vscode-base` documentation](../vscode-base/README.md) for recommended settings when using this workspace.

For more complex projects, instructors are encouraged to include the following files in the workspace directory:

- `.vscode/settings.json`, specifying options such as source directory, output path and libraries. A simple version of this file may contain the following content:

  ```json
  {
    "java.project.sourcePaths": ["src"],
    "java.project.outputPath": "bin",
    "java.project.referencedLibraries": ["lib/**/*.jar"]
  }
  ```

- `.vscode/launch.json`, specifying the file containing the main method that is the starting point for the application. For example, if the class `edu.myuni.mycourse.main.MainClass` should be used as a starting point, then this file may contain the following content:

  ```json
  {
    "version": "0.2.0",
    "configurations": [
      {
        "type": "java",
        "name": "MainClass",
        "request": "launch",
        "mainClass": "edu.myuni.mycourse.main.MainClass"
      }
    ]
  }
  ```
