FROM prairielearn/workspace-vscode-base:latest
ARG CACHEBUST=2025-04-04-17-34-59

# Make sure to build using bash as the shell so that conda/mamba hooks will
# work during installation.
SHELL ["/bin/bash", "-c"]

USER root

RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc libc6-dev graphviz graphviz-dev \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install Python and required packages via uv.
# This is a prerequisite for the VS Code extensions in the following steps.
USER coder

COPY requirements.txt /

# /home/coder/.venv/bin/python3 -> /home/coder/.local/bin/python3 -> /home/coder/.local/share/uv/python/*/bin/python3.10
RUN cd $HOME \
    && curl -LO https://astral.sh/uv/install.sh \
    && sh install.sh && rm install.sh \
    && source "$HOME/.local/bin/env" \
    && uv python install --default --preview 3.10 \
    && uv venv \
    && pwd && ls \
    && echo "source $HOME/.venv/bin/activate" >> ~/.bashrc && source $HOME/.venv/bin/activate \
    && uv pip install --no-cache-dir -r /requirements.txt && uv cache clean

USER coder
 
# After installing Python we install some VS Code extensions.
RUN code-server --disable-telemetry --force \
    # vscode support for python, including debugger
    --install-extension ms-python.python \
    # auto-fix indentation for multiline contexts
    --install-extension KevinRose.vsc-python-indent \
    # Clear the extension cache to reduce image size.
    && rm -rf /home/coder/.local/share/code-server/CachedExtensionVSIXs
