FROM prairielearn/workspace-vscode-base:latest

USER root
RUN apt-get update && apt-get install -y openjdk-21-jdk-headless && apt-get clean

USER coder
# Java support
RUN code-server --disable-telemetry --force \
    --install-extension redhat.java \
    --install-extension vscjava.vscode-java-debug \
    && rm -rf /home/coder/.local/share/code-server/CachedExtensionVSIXs
