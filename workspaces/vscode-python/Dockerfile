FROM prairielearn/workspace-vscode-base:latest
ARG CACHEBUST=2025-04-10-12-51-24

# Make sure to build using bash as the shell so that conda/mamba hooks will
# work during installation.
SHELL ["/bin/bash", "-c"]

# Install Python and required packages via miniconda.
# This is a prerequisite for the VS Code extensions in the following steps.
USER coder
COPY requirements.txt /
# SC1091: `source` an unknown file is required to activate Conda.
# hadolint ignore=SC1091
RUN arch="$(uname -m)" \
    && curl -sfLO "https://github.com/conda-forge/miniforge/releases/latest/download/Miniforge3-Linux-${arch}.sh" \
    && chmod +x "Miniforge3-Linux-${arch}.sh" \
    && ./"Miniforge3-Linux-${arch}.sh" -b -p /home/coder/conda \
    # Install conda and mamba hooks for future interactive bash sessions:
    && /home/coder/conda/bin/mamba init bash \
    # Activate hooks in the current noninteractive session:
    && . "/home/coder/conda/etc/profile.d/conda.sh" \
    && . "/home/coder/conda/etc/profile.d/mamba.sh" \
    && mamba activate \
    # Installing `pygraphviz` with pip would require `build-essentials`, `graphviz`,
    # and `graphviz-dev` to be installed at the OS level, which would increase the
    # image size. Instead, we install it from Conda, which prebuilds it and also
    # automatically installs a Conda-specific `graphviz` dependency.
    && mamba install --yes "$(grep pygraphviz /requirements.txt | head -n 1)" \
    && pip install --no-cache-dir -r /requirements.txt \
    && rm "Miniforge3-Linux-${arch}.sh" \
    && mamba clean --all --yes --quiet \
    && pip cache purge

USER coder
 
# After installing Python we install some VS Code extensions.
RUN code-server --disable-telemetry --force \
    # vscode support for python, including debugger
    --install-extension ms-python.python \
    # auto-fix indentation for multiline contexts
    --install-extension KevinRose.vsc-python-indent \
    # Clear the extension cache to reduce image size.
    && rm -rf /home/coder/.local/share/code-server/CachedExtensionVSIXs
