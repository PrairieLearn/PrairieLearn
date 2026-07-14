FROM node:26-trixie
ARG CACHEBUST=2026-06-15-15-59-28
LABEL com.prairielearn.workspace.home="/home/student"
LABEL com.prairielearn.workspace.port="8080"
LABEL com.prairielearn.workspace.rewrite-url="true"

RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends emacs-nox vim tmux gosu \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -g 1001 student \
    && useradd -u 1001 -g 1001 -m student

COPY --chmod=0755 --chown=root:root pl-gosu-helper.sh /usr/bin/
COPY src /xterm

WORKDIR /xterm
RUN npm install --frozen-lockfile && npm cache clean --force

ENTRYPOINT ["/usr/bin/pl-gosu-helper.sh", "node", "server.js", "-w", "/home/student"]
