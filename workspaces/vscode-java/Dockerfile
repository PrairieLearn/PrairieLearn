FROM prairielearn/workspace-vscode-base:latest
ARG CACHEBUST=2026-02-15-14-23-34

USER root
RUN apt-get update && apt-get install -y --no-install-recommends openjdk-25-jdk-headless && apt-get clean && rm -rf /var/lib/apt/lists/*

USER coder
# We're downloading a specific version of the Red Hat Java extension from
# open-vsx, because we want to ensure that the universal version is used instead
# of a platform-specific version. The universal version provides all necessary
# functionality and is significantly smaller in size. Also, code-server is using
# the wrong version of the extension (see
# https://github.com/coder/code-server/discussions/7613).
RUN curl -fsSL https://open-vsx.org/api/redhat/java/1.52.0/file/redhat.java-1.52.0.vsix -o /tmp/redhat.java-1.52.0.vsix && \
  echo "57eb9f5bc4606299711516be0482e9d659a2b64b43b9cacdd0586c058d730266  /tmp/redhat.java-1.52.0.vsix" | sha256sum -c - && \
  code-server --disable-telemetry --force --verbose \
  # Java language support
  --install-extension /tmp/redhat.java-1.52.0.vsix \
  # Java debugger
  --install-extension vscjava.vscode-java-debug \
  # Support for JUnit testing
  --install-extension vscjava.vscode-java-test \
  # Java projects view
  --install-extension vscjava.vscode-java-dependency \
  && rm -rf /home/coder/.local/share/code-server/CachedExtensionVSIXs /tmp/redhat.java-1.52.0.vsix
