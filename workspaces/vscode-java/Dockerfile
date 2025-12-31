FROM prairielearn/workspace-vscode-base:latest

USER root
RUN apt-get update && apt-get install -y --no-install-recommends openjdk-25-jdk-headless && apt-get clean && rm -rf /var/lib/apt/lists/*

USER coder
RUN code-server --disable-telemetry --force \
    # Java language support
    --install-extension redhat.java \
    # Java debugger
    --install-extension vscjava.vscode-java-debug \
    # Support for JUnit testing
    --install-extension vscjava.vscode-java-test \
    # Java projects view
    --install-extension vscjava.vscode-java-dependency \
    && rm -rf /home/coder/.local/share/code-server/CachedExtensionVSIXs \
    && code-server --list-extensions --show-versions
