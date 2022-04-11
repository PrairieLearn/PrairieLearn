# xterm.js terminal

This image provides a terminal emulator based on the [`xterm.js`](https://xtermjs.org/) library.

The xterm.js workspace image is built off the Node Debian Buster docker image.

node.js is installed to support the web interface, as well as some simple
applications like `emacs` and `vim` to support a terminal workflow.

## Command-line arguments

Various command-line arguments can be passed to the xterm.js server to customize the workspace experience:

| Name            | Alias | Description                   | Default     |
| --------------- | ----- | ----------------------------- | ----------- |
| `--command`     | `-c`  | Command to execute on startup | `/bin/bash` |
| `--working-dir` | `-w`  | Initial working directory     | Home folder |
