FROM node:26-trixie
ARG CACHEBUST=2026-05-15-14-49-21

RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends emacs-nox vim tmux \
    && npm install -g pnpm@^10.33.0 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*
COPY src /xterm

WORKDIR /xterm
RUN pnpm install --frozen-lockfile --prefer-offline --config.confirmModulesPurge=false \
    && pnpm store purge --force

RUN useradd -m student
ENTRYPOINT ["node", "server.js", "-w", "/home/student"]
