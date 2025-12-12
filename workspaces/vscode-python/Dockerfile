FROM prairielearn/workspace-vscode-base:latest
ARG CACHEBUST=2025-11-15-14-13-19

# Run the rest of the build commands in a bash shell in login mode so that
# conda/mamba shell hooks will work. This also allows images derived from
# this one to add "RUN pip install" commands without trouble. To complete
# this setup, we also must run conda init with --system after conda is
# installed, as a separate step below.
SHELL ["/bin/bash", "-lc"]

# - Ensure that all `uv` commands compile Python source files to bytecode.
# - Ensure that all `uv` commands do not use any caching.
ENV UV_COMPILE_BYTECODE=1 UV_NO_CACHE=1

USER root

RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc libc6-dev graphviz graphviz-dev \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# This is a prerequisite for the VS Code extensions in the following steps.
USER coder
WORKDIR "/home/coder"

# Install Python and required packages via uv.
# /home/coder/.venv/bin/python3 -> /home/coder/.local/bin/python3 -> /home/coder/.local/share/uv/python/*/bin/python3.10
COPY requirements.txt /
RUN curl -LO https://astral.sh/uv/install.sh \
    && sh install.sh && rm install.sh \
    && source "$HOME/.local/bin/env" \
    && uv python install --default 3.12 \
    && uv venv \
    && echo "source $HOME/.venv/bin/activate" >> ~/.bashrc && source "$HOME/.venv/bin/activate" \
    && uv pip install --no-cache-dir -r /requirements.txt

# After installing Python we install some VS Code extensions.
USER coder
RUN code-server --disable-telemetry --force \
    # vscode support for python, including debugger
    --install-extension ms-python.python \
    # auto-fix indentation for multiline contexts
    --install-extension KevinRose.vsc-python-indent \
    # Clear the extension cache to reduce image size.
    && rm -rf /home/coder/.local/share/code-server/CachedExtensionVSIXs

WORKDIR "/home/coder/workspace"
