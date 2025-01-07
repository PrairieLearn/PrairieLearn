FROM prairielearn/workspace-vscode-base

USER root
RUN apt-get update && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends \
    build-essential \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    && find /tmp -not -path /tmp -delete

USER coder

# After installing C/C++ we install some VS Code extensions.
RUN code-server --disable-telemetry --force \
    # a collection of useful C/C++ extensions
    --install-extension franneck94.vscode-c-cpp-dev-extension-pack \
    # Clear the extension cache to reduce image size.
    && rm -rf /home/coder/.local/share/code-server/CachedExtensionVSIXs
