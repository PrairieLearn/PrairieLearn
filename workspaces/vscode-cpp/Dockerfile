FROM prairielearn/workspace-vscode-base:latest
ARG CACHEBUST=2025-11-15-14-13-19

USER root
RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends build-essential valgrind gdb pkg-config jq \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    && find /tmp -not -path /tmp -delete

USER coder

COPY --chmod=0644 --chown=coder:coder gdbinit /home/coder/.gdbinit
COPY --chmod=0644 --chown=coder:coder lldbinit /home/coder/.lldbinit
COPY --chmod=0644 --chown=coder:coder settings.json /tmp/new_settings.json

# After installing C/C++ we install some VS Code extensions.
# codelldb is installed from a downloaded file because the open-vsx version of
# the extension downloads the latest version of the extension upon loading,
# which would not be appropriate in a containerized environment with restricted
# network access.
RUN arch="$(uname -m)" && \
    if [ "$arch" = "x86_64" ]; then arch="x64"; \
    elif [ "$arch" = "aarch64" ]; then arch="arm64"; \
    else echo "Unsupported architecture: $arch"; exit 1; fi && \
    curl -fsSL "https://github.com/vadimcn/codelldb/releases/download/v1.11.8/codelldb-linux-${arch}.vsix" -o /tmp/codelldb-linux.vsix && \
    code-server --disable-telemetry --force  \
    --install-extension jeff-hykin.better-cpp-syntax \
    --install-extension ms-vscode.cpptools-themes \
    --install-extension ms-vscode.makefile-tools \
    --install-extension /tmp/codelldb-linux.vsix \
    && rm -rf /home/coder/.local/share/code-server/CachedExtensionVSIXs /tmp/codelldb-linux.vsix \
    # Merge existing settings with new settings
    && cp /home/coder/.local/share/code-server/User/settings.json /tmp/old_settings.json \
    && jq -s '.[0] + .[1]' /tmp/old_settings.json /tmp/new_settings.json > /home/coder/.local/share/code-server/User/settings.json \
    && rm /tmp/old_settings.json /tmp/new_settings.json

