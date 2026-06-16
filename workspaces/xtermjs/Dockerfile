FROM node:26-trixie
ARG CACHEBUST=2026-06-15-15-59-28
LABEL com.prairielearn.workspace.home="/home/student"
LABEL com.prairielearn.workspace.port="8080"

RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends emacs-nox vim tmux \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*
COPY src /xterm

WORKDIR /xterm
RUN npm install --frozen-lockfile && npm cache clean --force

RUN useradd -m student
ENTRYPOINT ["node", "server.js", "-w", "/home/student"]
