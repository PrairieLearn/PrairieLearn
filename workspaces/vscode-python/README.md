# workspace-vscode-python

This image is modified to use user 1001 by default instead of 1000, in
accordance with how PrairieLearn runs the image.

We standardize on `/home/coder/workspace` as the default working directory
for the editor, and we recommend that staff set this as `workspaceOptions`
"home" in the question configuration.

This will copy the question's workspace folder contents into an empty mounted
directory at `/home/coder/workspace` and save it for the student in the cloud
for that question instance, while rebooting the container will always reuse
the initial contents of `/home/coder` from the image (such as configuration
files for the OS and the editor).

## Installing VS Code extensions

The Dockerfile preinstalls some VS Code extensions. You could fork this image
and preinstall additional extensions. (As with forking any workspace image,
you would then need to locally build and push the modified image to your own
Docker Hub account, and then reference it by the correct name in the
`info.json` file for your question.)

We use an open-source, web-based version of VS Code,
[code-server](https://github.com/coder/code-server).
To comply with Microsoft's license terms, code-server installs extensions
from the independent marketplace
[Open VSX](https://open-vsx.org)
instead of using Microsoft's official VS Code marketplace. Many extensions
are available from Open VSX by the same names, but some extensions might not
be compatible.
