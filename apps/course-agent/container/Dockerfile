FROM docker.io/cloudflare/sandbox:1.0.2 AS sandbox

# Only Codex's native binary and its helpers are needed; the npm package is a Node launcher.
FROM node:24-bookworm-slim AS codex
ARG TARGETARCH
RUN case "$TARGETARCH" in \
      amd64) package=linux-x64 triple=x86_64-unknown-linux-musl ;; \
      arm64) package=linux-arm64 triple=aarch64-unknown-linux-musl ;; \
      *) echo "Unsupported architecture: $TARGETARCH" >&2; exit 1 ;; \
    esac \
  && cd /tmp \
  && npm pack --silent "@openai/codex@0.163.0-$package" \
  && tar -xzf openai-codex-*.tgz \
  && mv "package/vendor/$triple" /opt/codex \
  # Voice support is unused and is the largest helper.
  && rm -rf /opt/codex/codex-resources/voice

FROM debian:bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates procps zstd tini \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --gid 1000 node \
  && useradd --uid 1000 --gid node --create-home --shell /bin/bash node \
  && mkdir -p /workspace \
  && chown node:node /workspace
# Without an identity, Git guesses one from the hostname with a DNS lookup that times out in the
# offline sandbox, stalling every command that writes a commit or reflog (about 28 s per clone).
RUN git config --system user.name "PrairieLearn" && git config --system user.email "course-agent@prairielearn.com"
COPY --from=codex /opt/codex /opt/codex
RUN ln -s /opt/codex/bin/codex /usr/local/bin/codex
COPY --from=sandbox /usr/local/bin/sandbox-shim /usr/local/bin/sandbox-shim
COPY container/setup.sh /usr/local/bin/course-agent-setup
CMD ["/usr/bin/tini", "--", "sleep", "infinity"]
