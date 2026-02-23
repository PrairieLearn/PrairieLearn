FROM prairielearn/workspace-vscode-base:latest
ARG CACHEBUST=2026-02-15-14-23-34

# Run the rest of the build commands in a bash shell in login mode so that
# conda/mamba shell hooks will work. This also allows images derived from
# this one to add "RUN pip install" commands without trouble. To complete
# this setup, we also must run conda init with --system after conda is
# installed, as a separate step below.
SHELL ["/bin/bash", "-lc"]

# Ensure that running Python in the container will use the correct Python version.
ENV PATH="/home/coder/.venv/bin:$PATH"

# - Ensure that all `uv` commands compile Python source files to bytecode.
# - Ensure that all `uv` commands do not use any caching.
ENV UV_COMPILE_BYTECODE=1 UV_NO_CACHE=1

USER root
WORKDIR "/"

RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc libc6-dev graphviz graphviz-dev \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    # Install uv
    && curl -LO https://astral.sh/uv/install.sh \
    && UV_INSTALL_DIR=/usr/local/bin sh /install.sh && rm /install.sh

# This is a prerequisite for the VS Code extensions in the following steps.
USER coder
WORKDIR "/home/coder"

# Create the virtual environment as the coder user
RUN uv venv --python-preference managed --python 3.13 /home/coder/.venv

COPY requirements.txt /home/coder/requirements.txt
RUN uv pip install -r /home/coder/requirements.txt

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
