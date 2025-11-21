FROM prairielearn/workspace-vscode-base:latest
ARG CACHEBUST=2025-11-15-14-13-19

USER root
RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends build-essential \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    && find /tmp -not -path /tmp -delete

USER coder

# After installing C/C++ we install some VS Code extensions.
# codelldb is installed from a downloaded file because the open-vsx version of
# the extension downloads the latest version of the extension upon loading,
# which would not be appropriate in a containerized environment with restricted
# network access.
RUN arch="$(uname -m)" && \
    if [ "$arch" = "x86_64" ]; then arch="x64"; \
    elif [ "$arch" = "aarch64" ]; then arch="arm64"; \
    else echo "Unsupported architecture: $arch"; exit 1; fi && \
    curl -fsSL "https://github.com/vadimcn/codelldb/releases/download/v1.11.4/codelldb-linux-${arch}.vsix" -o /tmp/codelldb-linux.vsix && \
    code-server --disable-telemetry --force  \
    --install-extension jeff-hykin.better-cpp-syntax \
    --install-extension ms-vscode.cpptools-themes \
    --install-extension ms-vscode.makefile-tools \
    --install-extension /tmp/codelldb-linux.vsix \
    && rm -rf /home/coder/.local/share/code-server/CachedExtensionVSIXs /tmp/codelldb-linux.vsix
