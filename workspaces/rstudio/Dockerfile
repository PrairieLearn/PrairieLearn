# PrairieLearn RStudio workspace template
# 20210831 Eric Huber - Initial version
# 20240123 Eric Huber - Modify service file to provide server-user argument
# 20240127 Eric Huber - Pin base image, fix issues with the Nginx reverse proxy

# Maintainer notes:

# The s6 init system is part of the base image and we are working within its
# expectations. As a side effect of the unusual workarounds we are using to
# run as a limited user, it is normal to see s6 report some errors in the
# terminal log during startup, such as "unable to read status", "operation
# not permitted", "permission denied", "unable to chown", or "password not
# changed".

# If you want to test the proxy behavior locally, you should build a local
# copy of the image and set PL to not pull workspace images, using
# "workspacePullImagesFromDockerHub": false in config.json. Then, access a
# question referencing the image through your local PL session. If you want
# to test https mode, more info here:
# https://github.com/PrairieLearn/PrairieLearn/discussions/8897

# Trying to directly access the reverse proxy outside of the PL context may
# not work due to CORS issues.

# This image also MUST be tested in a question on the PrairieLearn site
# before deploying it to students. You can push and sync a separate tag on
# Docker Hub for testing without disrupting the official PL image.

# Set up your question with these options in info.json, editing the "image"
# parameter if you are using a custom image build for testing:

#    "workspaceOptions": {
#        "image": "prairielearn/workspace-rstudio",
#        "port": 3939,
#        "args": "",
#        "rewriteUrl": false,
#        "home": "/home/rstudio/workspace"
#    }

# If you just want to use RStudio locally for its own sake:
# $ docker build -t rstudio-local .
# $ docker run -it --rm -u 1001:1001 -p 127.0.0.1:8787:8787 rstudio-local
# And then open your browser to: http://localhost:8787/
# However, you could use the Rocker base images in that case.
# Their site has more documentation.

FROM rocker/rstudio:4.5.1
ARG CACHEBUST=2025-06-15-14-13-20

# On PL, we need to use 1001:1001 for the default user account. We adjust the
# pre-existing rstudio user which is typically uid 1000 otherwise.
USER 0
RUN OLD_UID="$(id -u rstudio)" && \
    OLD_GID="$(id -g rstudio)" && \
    export OLD_GID OLD_UID NEW_UID=1001 NEW_GID=1001 && \
    groupmod -g 1001 rstudio && \
    usermod -u 1001 -g 1001 rstudio && \
    find /home -user "$OLD_UID" -execdir chown -h "$NEW_UID" {} + && \
    find /home -group "$OLD_GID" -execdir chgrp -h "$NEW_GID" {} + && \
    unset OLD_UID OLD_GID NEW_UID NEW_GID

USER 0
RUN apt-get update && \
    # Run 'unminimize' to add docs
    apt-get install -y --no-install-recommends man-db unminimize && \
    yes | unminimize && \
    apt-get install -y --no-install-recommends \
    # Reverse proxy workaround for PrairieLearn:
    nginx \
    gettext \
    gosu \
    fonts-dejavu \
    # Utilities for convenience debugging this container:
    less htop vim nano silversearcher-ag zip unzip git cmake curl wget sqlite3 && \
    # Test:
    gosu nobody true && \
    # Cleanup:
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* && \
    find /tmp -not -path /tmp -delete

# Make sure we'll be able to run as user 1001. This is hacky.
USER 0
RUN mkdir -p /var/run/s6 && \
    chown -R 1001:1001 /var/run/s6 && \
    chown -R 1001:1001 /usr/local/lib/R && \
    chown -R 1001:1001 /var/lib/rstudio-server && \
    chown -R 1001:1001 /var/run/rstudio-server && \
    chown -R 1001:1001 /etc/rstudio
# We store some generated files and the Nginx pid file in /var/pl-var.
RUN mkdir -p /var/pl-var && \
    chown -R 1001:1001 /var/lib/nginx /var/log/nginx /var/pl-var
# The Nginx proxy allows us to change the base URL for the RStudio session,
# which is necessary for embedding on PrairieLearn. The Nginx conf file needs
# to be writable so we can update the base URL at startup.
COPY rstudio-nginx.conf /etc/nginx/nginx.conf
RUN chown 1001:1001 /etc/nginx/nginx.conf
# Patch the service file that s6 invokes to make sure that rstudio-server
# runs as our normal user
RUN MATCH_REGEX='^\(exec /usr/lib/rstudio-server/bin/rserver --server-daemonize 0\)$' && \
    SERVICE_FILE='/etc/services.d/rstudio/run' && \
    grep -qe "$MATCH_REGEX" "$SERVICE_FILE" || { \
        echo "Error patching rstudio service file: Format changed in upstream image. Revise Dockerfile." >&2 ; \
        exit 1 ; \
    } && \
    sed -i "s#$MATCH_REGEX#\1 --server-user rstudio#g" "$SERVICE_FILE"

# The proxy uses 3939 and the internal RStudio session uses 8787.
# We only need to expose 3939 here.
EXPOSE 3939

# Please read the note here carefully to avoid wiping out what you installed
# in ~/.local:

# EDITOR_FOCUS_DIR should be set to the directory you want the editor to start
# up in. This is not necessarily the same as the "home" setting in the
# question's info.json file. The "home" setting determines the mount point for
# the persistent cloud storage, which will hide any contents your image
# originally had at the same path. You might want to set both EDITOR_FOCUS_DIR
# and "home" to a deeper directory than /home/rstudio if you want to keep the
# default home contents from the workspace image (~/.local, etc.). For
# example, using /home/rstudio/workspace will copy the question's workspace
# folder contents into an empty mount at /home/rstudio/workspace and save it for
# the student, while always reusing the initial contents of /home/rstudio that
# you prepared in the image. (However, if students try to customize their
# editor settings, those will get reset in between sessions this way.)

USER rstudio
ENV EDITOR_FOCUS_DIR="/home/rstudio/workspace"
RUN mkdir -p "$EDITOR_FOCUS_DIR"

# The .Rprofile hack will set the working directory of the left code panes but
# not the right file browser pane. The rsession.conf hack below will set both.
# Keeping the setting out of the home directory also helps if you intend to
# mount the persisted storage there (which shadows whatever is in the image).
### The .Rprofile hack: (not used currently)
# USER rstudio
# RUN echo "setwd('$EDITOR_FOCUS_DIR')" >> "/home/rstudio/.Rprofile"
### The rsession.conf hack:
USER 0
RUN echo "session-default-working-dir=$EDITOR_FOCUS_DIR" >> /etc/rstudio/rsession.conf && \
    echo "session-default-new-project-dir=$EDITOR_FOCUS_DIR" >> /etc/rstudio/rsession.conf

# Prepare the entrypoint script
USER 0
COPY ["pl-start.sh", "pl-gosu-helper.sh", "/pl-bin/"]
RUN mkdir -p /pl-bin && \
    chmod a+rx /pl-bin /pl-bin/pl-start.sh /pl-bin/pl-gosu-helper.sh

# Warning: In general, don't edit the variables below. Do NOT try to set
# RStudio Server's USERID environment variable here, as this will cause the
# home directory to be deleted and recreated (or cause startup errors). The
# remapping to 1001:1001 is handled earlier in this file.

# Set some variables for RStudio Server to ensure everything works.
# We need to run as user rstudio (1001:1001). Do not run as root.
USER rstudio
ENV USER=rstudio
# Judging from some discussion online, the PASSWORD variable may be necessary
# due to a bug in RStudio Server's DISABLE_AUTH mode.
ENV DISABLE_AUTH=true
ENV PASSWORD=placeholder
# This tells s6 to use alternative, writable locations if the paths it
# expects to write to are read-only.
ENV S6_READ_ONLY_ROOT=1

# On the production server, this will be overwritten dynamically when PL
# creates the workspace at a different URL.
ENV WORKSPACE_BASE_URL=rstudio
# PL_USER should be user 1001's intended name. The gosu helper uses this to
# make sure local testing works even if the PL Docker tries to run as root.
ENV PL_USER=rstudio
ENTRYPOINT [ "/pl-bin/pl-gosu-helper.sh", "/pl-bin/pl-start.sh" ]
