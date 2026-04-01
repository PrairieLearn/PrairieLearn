FROM prairielearn/workspace-vscode-base:latest
ARG CACHEBUST=2026-03-15-14-27-00

USER root
RUN apt-get update && apt-get install -y --no-install-recommends openjdk-25-jdk-headless && apt-get clean && rm -rf /var/lib/apt/lists/*

USER coder
# We're downloading a specific version of the Red Hat Java extension from
# open-vsx, because we want to ensure that the universal version is used instead
# of a platform-specific version. The universal version provides all necessary
# functionality and is significantly smaller in size. Also, code-server is using
# the wrong version of the extension (see
# https://github.com/coder/code-server/discussions/7613).
RUN curl -fsSL https://open-vsx.org/api/redhat/java/1.53.0/file/redhat.java-1.53.0.vsix -o /tmp/redhat.java-1.53.0.vsix && \
  echo "e2030557ab8ca44c6a6605b070f60bc4e9c724142d4f4d8b63756a7f344ba1a4  /tmp/redhat.java-1.53.0.vsix" | sha256sum -c - && \
  code-server --disable-telemetry --force --verbose \
  # Java language support
  --install-extension /tmp/redhat.java-1.53.0.vsix \
  # Java debugger
  --install-extension vscjava.vscode-java-debug \
  # Support for JUnit testing
  --install-extension vscjava.vscode-java-test \
  # Java projects view
  --install-extension vscjava.vscode-java-dependency \
  && rm -rf /home/coder/.local/share/code-server/CachedExtensionVSIXs /tmp/redhat.java-1.53.0.vsix
