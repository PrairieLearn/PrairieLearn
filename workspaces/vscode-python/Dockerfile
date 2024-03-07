FROM codercom/code-server:4.20.1-bookworm

# On PL, we want to standardize on using 1001:1001 for the user. We change the
# "coder" account's UID and GID here so that fixuid has no work to do later.
# This speeds up container loading time drastically and avoids timeouts.
USER root
RUN export OLD_UID=$(id -u coder) && \
	export OLD_GID=$(id -g coder) && \
	export NEW_UID=1001 && \
	export NEW_GID=1001 && \
	groupmod -g 1001 coder && \
	usermod -u 1001 -g 1001 coder && \
	find /home -user $OLD_UID -execdir chown -h $NEW_UID {} + && \
	find /home -group $OLD_GID -execdir chgrp -h $NEW_GID {} + && \
	unset OLD_UID OLD_GID NEW_UID NEW_GID

# Make sure that code-server's entrypoint doesn't run fixuid unnecessarily
USER root
RUN mkdir -p /run /var/run && \
    touch /run/fixuid.ran /var/run/fixuid.ran

EXPOSE 8080
	
# Install Python and required packages via miniconda
USER coder
COPY requirements.txt /
RUN export arch=`uname -m` \
 && curl -sfLO https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-${arch}.sh \
 && /bin/bash Miniconda3-latest-Linux-${arch}.sh -b -p /home/coder/miniconda \
 && PATH="/home/coder/miniconda/bin:$PATH" \
 && /home/coder/miniconda/condabin/conda init bash \
 && conda config --add channels conda-forge \
 && conda run -n base pip install -r /requirements.txt

# Install VS Code extensions and clear the extension cache to reduce image size.
USER coder
RUN ( code-server --disable-telemetry --force \
		# vscode support for python, including debugger 
		--install-extension ms-python.python \
		# auto-generate templates for function docstrings 
		--install-extension njpwerner.autodocstring \
		# auto-fix indentation for multiline contexts 
		--install-extension KevinRose.vsc-python-indent \
		# visualize indentation with color 
        --install-extension oderwat.indent-rainbow \
		# visualize csv files in vscode window
		--install-extension mechatroner.rainbow-csv \
		# linting for markdown files
		--install-extension DavidAnson.vscode-markdownlint \
		# format tables in markdown files
        --install-extension fcrespo82.markdown-table-formatter \
	) && \
	rm -rf /home/coder/.local/share/code-server/CachedExtensionVSIXs

# Please read the note here carefully to avoid wiping out what you installed
# in ~/.local:

# EDITOR_FOCUS_DIR should be set to the directory you want the editor to start
# up in. This is not necessarily the same as the "home" setting in the
# question's info.json file. The "home" setting determines the mount point for
# the persistent cloud storage, which will hide any contents your image
# originally had at the same path. You might want to set both EDITOR_FOCUS_DIR
# and "home" to a deeper directory than /home/coder if you want to keep the
# default home contents from the workspace image (~/.local, etc.).

# For example, in the PL question configuration, setting workspaceOptions
# home to /home/coder/workspace will copy the question's workspace folder
# contents into an empty mount at /home/coder/workspace and save it for the
# student, while always reusing the initial contents of /home/coder that you
# prepared in the image. (However, if students try to customize their editor
# settings, those will get reset in between sessions this way.)
USER coder
ENV EDITOR_FOCUS_DIR "/home/coder/workspace"
RUN mkdir -p "$EDITOR_FOCUS_DIR"
WORKDIR "$EDITOR_FOCUS_DIR"

RUN mkdir -p "/home/coder/.local/share/code-server/User" "/home/coder/workspace"
COPY --chmod=0444 settings.json /home/coder/.local/share/code-server/User/settings.json
COPY --chmod=0444 coder.json /home/coder/.local/share/code-server/coder.json

ENTRYPOINT ["/usr/bin/entrypoint.sh", "--auth", "none", \
    "--disable-update-check", "--disable-telemetry", \
    "--bind-addr", "0.0.0.0:8080", "."]