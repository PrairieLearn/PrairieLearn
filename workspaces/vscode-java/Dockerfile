FROM prairielearn/workspace-vscode-base:latest

USER root
RUN apt-get update && apt-get install -y --no-install-recommends openjdk-25-jdk-headless && apt-get clean && rm -rf /var/lib/apt/lists/*

USER coder
# We're downloading a specific version of the Red Hat Java extension from
# open-vsx, because we want to ensure that the universal version is used instead
# of a platform-specific version. The universal version provides all necessary
# functionality and is significantly smaller in size. Also, code-server is using
# the wrong version of the extension (see
# https://github.com/coder/code-server/discussions/7613).
RUN curl -fsSL https://open-vsx.org/api/redhat/java/1.50.0/file/redhat.java-1.50.0.vsix -o /tmp/redhat.java-1.50.0.vsix && \
  echo "405f424df861c2af8b777337d5545a65a014b010e251335d6db3b08e513ae999  /tmp/redhat.java-1.50.0.vsix" | sha256sum -c - && \
  code-server --disable-telemetry --force --verbose \
  # Java language support
  --install-extension /tmp/redhat.java-1.50.0.vsix \
  # Java debugger
  --install-extension vscjava.vscode-java-debug \
  # Support for JUnit testing
  --install-extension vscjava.vscode-java-test \
  # Java projects view
  --install-extension vscjava.vscode-java-dependency \
  && rm -rf /home/coder/.local/share/code-server/CachedExtensionVSIXs /tmp/redhat.java-1.50.0.vsix
