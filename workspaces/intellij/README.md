# Desktop GUI Workspace

This image provides an interface for IntelliJ IDEA using an Ubuntu-based desktop environment that can be accessed through a web browser. It uses the same underlying technology as the [PrairieLearn Desktop Workspace](../desktop/README.md) but is customized to open IntelliJ IDEA on startup in full screen.

## Setting up questions using this workspace

To use this workspace in your PrairieLearn course, set the `workspaceOptions` in your question JSON to the following:

```json
{
  "workspaceOptions": {
    "image": "prairielearn/workspace-intellij",
    "port": 8080,
    "home": "/home/prairielearner/Project"
    // ...
  }
}
```

Note that the `home` directory is set to `/home/prairielearner/Project`, which is where the workspace will open by default. The image is set up to open IntelliJ IDEA with this directory as the project folder, so you should not modify this path.

You are strongly encouraged to set up an initial workspace directory by adding files in the `workspace` directory of your question. This will allow students to have starter code or project files when they open the workspace. To speed up the loading of the workspace on IntelliJ, you are strongly encouraged to include the `.idea` folder in your initial workspace files, or to include files that will guide IntelliJ in generating the `.idea` folder (e.g., a `pom.xml` or `gradle.build` file for Maven or Gradle projects, respectively). While having only Java source files in the workspace is typically sufficient for IntelliJ to generate the `.idea` folder, having the project configuration files will ensure IntelliJ uses appropriate settings.

## Acknowledgements

On the client side, [noVNC](https://novnc.com/info.html) is used to provide the VNC connection. Specifically, their noVNC library API and some of their icon assets are used here. The API and assets are licensed under the [MPL 2.0](https://www.mozilla.org/en-US/MPL/2.0/) and [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) licenses, respectively.
