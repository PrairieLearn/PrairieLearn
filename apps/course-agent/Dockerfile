FROM docker.io/cloudflare/sandbox:0.12.9
RUN npm install -g @openai/codex@0.155.0
COPY codex-config.toml /opt/codex-config.toml
# Needed by wrangler dev for the private app-server connection.
EXPOSE 4500
