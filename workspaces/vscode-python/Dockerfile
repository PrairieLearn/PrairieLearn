FROM codercom/code-server:4.22.0-ubuntu

# On PL, we want to standardize on using 1001:1001 for the user. We change the
# "coder" account's UID and GID here so that fixuid has no work to do later.
# This speeds up container loading time drastically and avoids timeouts.
USER root
RUN OLD_UID=$(id -u coder) && \
    OLD_GID=$(id -g coder) && \
    NEW_UID=1001 && \
    NEW_GID=1001 && \
    groupmod -g $NEW_GID coder && \
    usermod -u $NEW_UID -g $NEW_GID coder && \
    find /home -user $OLD_UID -execdir chown -h $NEW_UID {} + && \
    find /home -group $OLD_GID -execdir chgrp -h $NEW_GID {} +

# Remove sudo permissions for default user, then test
USER root
RUN find /etc/sudoers.d -type f -not -name README -delete && \
    sudo -u coder bash -c 'if sudo echo "Test failed: User can sudo" ; then false ; fi'

# Apt installs: Enable manpages with "unminimize", and then install common utilities.
USER root
ARG DEBIAN_FRONTEND=noninteractive
RUN apt-get update && \
    yes | unminimize && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* && \
    find /tmp -not -path /tmp -delete
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    curl git htop less nano unzip vim wget zip && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* && \
    find /tmp -not -path /tmp -delete

# Install Python and required packages via miniconda
USER coder
COPY requirements.txt /
RUN export arch=`uname -m` \
 && curl -sfLO "https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-${arch}.sh" \
 && chmod +x "Miniconda3-latest-Linux-${arch}.sh" \
 && ./"Miniconda3-latest-Linux-${arch}.sh" -b -p /home/coder/miniconda \
 && PATH="/home/coder/miniconda/bin:$PATH" \
 && /home/coder/miniconda/condabin/conda init bash \
 && conda config --add channels conda-forge \
 && conda run -n base pip install -r /requirements.txt \
 && rm "Miniconda3-latest-Linux-${arch}.sh" \
 && conda clean --all

# Install VS Code extensions and clear the extension cache to reduce image size.
USER coder
RUN code-server --disable-telemetry --force \
    # vscode support for python, including debugger
    --install-extension ms-python.python \
    # auto-generate templates for function docstrings
    --install-extension njpwerner.autodocstring \
    # auto-fix indentation for multiline contexts
    --install-extension KevinRose.vsc-python-indent \
    # visualize csv files in vscode window
    --install-extension mechatroner.rainbow-csv \
    # linting for markdown files
    --install-extension DavidAnson.vscode-markdownlint \
    # format tables in markdown files
    --install-extension fcrespo82.markdown-table-formatter \
    && rm -rf /home/coder/.local/share/code-server/CachedExtensionVSIXs

# We standardize on /home/coder/workspace as the default working directory
# for the editor, and we recommend that staff set this as workspaceOptions
# "home" in the question configuration. See the README.md for details.
USER coder
RUN mkdir -p "/home/coder/workspace" "/home/coder/.local/share/code-server/User"
WORKDIR "/home/coder/workspace"
COPY --chmod=0644 --chown=coder:coder settings.json /home/coder/.local/share/code-server/User/settings.json

# Make sure that code-server's entrypoint doesn't run fixuid unnecessarily
USER root
RUN mkdir -p /run /var/run && \
    touch /run/fixuid.ran /var/run/fixuid.ran

USER coder
EXPOSE 8080
ENTRYPOINT ["/usr/bin/entrypoint.sh", "--auth", "none", \
    "--disable-update-check", "--disable-telemetry", \
    "--bind-addr", "0.0.0.0:8080", "."]
