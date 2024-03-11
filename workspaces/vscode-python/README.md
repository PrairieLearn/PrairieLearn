
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
