FROM node:buster

RUN apt-get update && apt-get upgrade -y
RUN apt-get install -y emacs-nox vim tmux
COPY src /xterm

WORKDIR /xterm
RUN yarn install --frozen-lockfile

ENTRYPOINT node server.js
