
# PrairieLearn RStudio workspace template
# 20210831 Eric Huber

FROM rocker/rstudio

# On PL, we need to use 1001:1001 for the user account.
USER 0
RUN export OLD_UID=$(id -u rstudio) && \
    export OLD_GID=$(id -g rstudio) && \
    export NEW_UID=1001 && \
    export NEW_GID=1001 && \
    groupmod -g 1001 rstudio && \
    usermod -u 1001 -g 1001 rstudio && \
    find /home -user $OLD_UID -execdir chown -h $NEW_UID {} + && \
    find /home -group $OLD_GID -execdir chgrp -h $NEW_GID {} + && \
    unset OLD_UID OLD_GID NEW_UID NEW_GID

USER 0
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    # Proxy workaround for PrairieLearn:
    nginx \
    gettext \
    gosu \
    fonts-dejavu \
    # Things for our sanity in the instructor terminal:
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
# The Nginx proxy allows us to change the base URL for the RStudio session
COPY rstudio-nginx.conf /etc/nginx/nginx.conf
# We store some generated files and the Nginx pid file in /var/pl-var.
# The Nginx conf file needs to be writable so we can update the base URL
# at startup.
RUN mkdir -p /var/pl-var && \
    chown -R 1001:1001 /var/lib/nginx /var/log/nginx /var/pl-var /etc/nginx/nginx.conf

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
ENV EDITOR_FOCUS_DIR "/home/rstudio/workspace"
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

# Warning: Do NOT try to set RStudio Server's USERID environment variable
# here, as this will cause the home directory to be deleted and recreated (or
# cause startup errors). The remapping to 1001:1001 is handled earlier in this
# file.

# We need to run as user rstudio (1001:1001). Do not run as root.
USER rstudio
# Set some variables for RStudio Server to ensure non-root mode works.
ENV USER rstudio
ENV DISABLE_AUTH true
ENV S6_READ_ONLY_ROOT 1
# Set a default base URL for local development if you run the workspace image
# by itself (without PL as host).
# This will become e.g.: http://localhost:3939/rstudio/
# On the production server, this will be overwritten dynamically when PL
# creates the workspace at a different URL.
ENV WORKSPACE_BASE_URL rstudio
# PL_USER should be user 1001's intended name. The gosu helper uses this to
# make sure local testing works even if the PL Docker tries to run as root.
ENV PL_USER rstudio
ENTRYPOINT /pl-bin/pl-gosu-helper.sh /pl-bin/pl-start.sh

# Set up your question with these options in info.json, editing the "image"
# parameter if you are using a custom image build:

#    "workspaceOptions": {
#        "image": "prairielearn/workspace-rstudio",
#        "port": 3939,
#        "args": "",
#        "rewriteUrl": false,
#        "home": "/home/rstudio/workspace"
#    }
