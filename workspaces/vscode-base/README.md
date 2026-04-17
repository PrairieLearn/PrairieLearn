# workspace-vscode

This image is modified to use user 1001 by default instead of 1000, in accordance with how PrairieLearn runs the image.

We standardize on `/home/coder/workspace` as the default working directory for the editor, and we recommend that staff set this as `workspaceOptions` "home" in the question configuration.

This will copy the question's workspace folder contents into an empty mounted directory at `/home/coder/workspace` and save it for the student in the cloud for that question instance, while rebooting the container will always reuse the initial contents of `/home/coder` from the image (such as configuration files for the OS and the editor).

## Installing VS Code extensions

The Dockerfile preinstalls some VS Code extensions. You could fork this image and preinstall additional extensions. (As with forking any workspace image, you would then need to locally build and push the modified image to your own Docker Hub account, and then reference it by the correct name in the `info.json` file for your question.)

We use an open-source, web-based version of VS Code, [code-server](https://github.com/coder/code-server). To comply with Microsoft's license terms, code-server installs extensions from the independent marketplace [Open VSX](https://open-vsx.org) instead of using Microsoft's official VS Code marketplace. Many extensions are available from Open VSX by the same names, but some extensions might not be compatible.

A student's ability to install additional extensions depends on if the workspace is configured to enable networking or not. If networking is enabled, then the student can install any extension from Open VSX. If networking is disabled, then the student cannot install any additional extensions, but they can still use the preinstalled extensions that are included in the image. If you want to block students from installing additional extensions in a custom workspace image while enabling networking otherwise, you could modify the entrypoint script to block access to the Open VSX marketplace by adding the following line at the end of your Dockerfile:

```dockerfile
ENV EXTENSIONS_GALLERY='{}'
```
