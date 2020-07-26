FROM node:stretch

RUN apt-get update && apt-get upgrade -y
RUN apt-get install -y emacs-nox vim tmux
COPY src /xterm

WORKDIR /xterm
RUN npm ci

ENTRYPOINT node server.js