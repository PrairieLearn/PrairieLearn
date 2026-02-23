FROM prairielearn/workspace-vscode-base:latest
ARG CACHEBUST=2026-02-15-14-23-34

USER root
RUN apt-get update && apt-get install -y --no-install-recommends openjdk-25-jdk-headless && apt-get clean && rm -rf /var/lib/apt/lists/*

USER coder
RUN code-server --disable-telemetry --force --verbose \
  # Java language support
  --install-extension oracle.oracle-java \
  && rm -rf /home/coder/.local/share/code-server/CachedExtensionVSIXs
