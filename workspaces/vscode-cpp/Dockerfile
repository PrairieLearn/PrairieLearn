FROM prairielearn/workspace-vscode-base

USER root
RUN apt-get update && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends \
    build-essential \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    && find /tmp -not -path /tmp -delete

USER coder

# USAGE:
# docker build --platform linux/amd64 -t prairielearn/workspace-vscode-cpp .
