FROM prairielearn/workspace-vscode-base:latest
ARG CACHEBUST=2026-02-15-14-23-34

USER root
RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends build-essential gdb pkg-config jq \
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
    if [ "$arch" = "x86_64" ]; then arch="x64"; hash="5d3cdacc4c6f338468ddfc129d740fafb9d856358831810df717d05fd309600a"; \
    elif [ "$arch" = "aarch64" ]; then arch="arm64"; hash="eddb73528c8fe843b24e71a15a60a21367c2b001c1b55af91cec2dcf5dc8cf73"; \
    else echo "Unsupported architecture: $arch"; exit 1; fi && \
    curl -fsSL "https://github.com/vadimcn/codelldb/releases/download/v1.12.1/codelldb-linux-${arch}.vsix" -o /tmp/codelldb-linux.vsix && \
    echo "${hash}  /tmp/codelldb-linux.vsix" | sha256sum -c - && \
    code-server --disable-telemetry --force  \
    --install-extension jeff-hykin.better-cpp-syntax \
    --install-extension ms-vscode.cpptools-themes \
    --install-extension ms-vscode.makefile-tools \
    --install-extension /tmp/codelldb-linux.vsix \
    && rm -rf /home/coder/.local/share/code-server/CachedExtensionVSIXs /tmp/codelldb-linux.vsix \
    # Merge vscode-base settings with vscode-cpp settings
    && cp /home/coder/.local/share/code-server/User/settings.json /tmp/base_settings.json \
    && jq -s '.[0] + .[1]' /tmp/base_settings.json /tmp/new_settings.json > /home/coder/.local/share/code-server/User/settings.json \
    && rm /tmp/base_settings.json /tmp/new_settings.json

