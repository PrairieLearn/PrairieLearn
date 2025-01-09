ARG BASE_IMAGE=prairielearn/workspace-vscode-base
ARG BASE_IMAGE_TAG=latest

FROM ${BASE_IMAGE}:${BASE_IMAGE_TAG}

USER root
RUN apt-get update && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends \
    build-essential \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    && find /tmp -not -path /tmp -delete

USER coder

# After installing C/C++ we install some VS Code extensions.
RUN curl -fsSL https://github.com/vadimcn/codelldb/releases/download/v1.11.1/codelldb-linux-x64.vsix -o /tmp/codelldb-linux-x64.vsix && \
    code-server --disable-telemetry --force \
    --install-extension franneck94.c-cpp-runner \
    --install-extension franneck94.vscode-c-cpp-config \
    --install-extension KylinIdeTeam.cppdebug \
    --install-extension jeff-hykin.better-cpp-syntax \
    --install-extension ms-vscode.cpptools-themes \
    --install-extension 13xforever.language-x86-64-assembly \
    --install-extension ms-vscode.makefile-tools \
    --install-extension /tmp/codelldb-linux-x64.vsix \
    && rm -rf /home/coder/.local/share/code-server/CachedExtensionVSIXs /tmp/codelldb-linux-x64.vsix
