#! /bin/bash

# If extensions gallery is not available in the server, disable it to avoid a
# query in the client. Without this check, if the workspace has networking
# disabled, the client will still be allowed to search for extensions using
# client-side queries, but since extensions are installed server-side, the
# installation will fail. With this check, the client will not be able to search
# for extensions, which avoids confusion. This check is done when the entrypoint
# is called instead of in the Dockerfile because the server may be started with
# networking enabled or disabled, and we want to support both cases without
# requiring a custom image. Also, Dockerfiles for child images should still be
# able to install extensions from the marketplace during build time, which
# requires the gallery to be enabled.
#
# The query returns a single extension, so it is not expensive, and the timeout
# is short, so it should not cause a significant delay in startup.
curl -fsL https://open-vsx.org/vscode/gallery/extensionquery --json '{"filters":[{"pageSize":1}]}' --connect-timeout 1 -o /dev/null || export EXTENSIONS_GALLERY="{}"
exec /usr/bin/entrypoint.sh --auth none --disable-update-check --disable-telemetry --bind-addr 0.0.0.0:8080 .
