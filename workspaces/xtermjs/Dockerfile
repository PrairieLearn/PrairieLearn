FROM node:20-bookworm

RUN apt-get update && apt-get upgrade -y
RUN apt-get install -y emacs-nox vim tmux
COPY src /xterm

WORKDIR /xterm
RUN yarn install --frozen-lockfile

RUN useradd -m student
ENTRYPOINT node server.js -w /home/student
