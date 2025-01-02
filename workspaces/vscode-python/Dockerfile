FROM prairielearn/workspace-vscode

USER root
RUN apt-get update && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    && find /tmp -not -path /tmp -delete

# Install VS Code extensions.
# We have first installed Python in the previous step, as specified in the
# documentation of the ms-python.python extension.

USER coder
RUN code-server --disable-telemetry --force \
    # vscode support for python, including debugger
    --install-extension ms-python.python \
    # auto-fix indentation for multiline contexts
    --install-extension KevinRose.vsc-python-indent

# USAGE:
# docker build --platform linux/amd64 -t prairielearn/workspace-vscode-python .
