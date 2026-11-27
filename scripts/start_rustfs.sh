#!/bin/bash
set -euo pipefail

# Work around lsof hanging in the Amazon Linux container on some hosts.
ulimit -Sn 4096

pid=$(lsof -nP -iTCP:5000 -sTCP:LISTEN -t || true)
if [[ -n "$pid" ]]; then
    process_name=$(ps -p "$pid" -o args=)
    if ! grep -q '[r]ustfs' <<< "$process_name"; then
        echo "Cannot start RustFS: port 5000 is already in use by process $pid." >&2
        if [[ "$(uname)" == "Darwin" ]] && grep -q 'ControlCenter' <<< "$process_name"; then
            echo "This might be caused by AirPlay Receiver: https://apple.stackexchange.com/questions/431154" >&2
        fi
        exit 1
    fi
else
    if [[ -x "$PWD/.local/bin/rustfs" ]]; then
        rustfs="$PWD/.local/bin/rustfs"
    elif command -v rustfs > /dev/null; then
        rustfs=$(command -v rustfs)
    else
        echo "RustFS is not installed. Run make rustfs-deps." >&2
        exit 1
    fi

    mkdir -p .local/rustfs
    RUSTFS_ACCESS_KEY=rustfsadmin RUSTFS_SECRET_KEY=rustfsadmin \
        "$rustfs" server --address 127.0.0.1:5000 "$PWD/.local/rustfs" > .local/rustfs.log 2>&1 &
    pid=$!
fi

for ((i = 0; i < 60; i++)); do
    if curl -fsS --max-time 1 http://127.0.0.1:5000/health > /dev/null 2>&1; then
        node scripts/init_rustfs.mjs
        exit 0
    fi
    if ! kill -0 "$pid" 2> /dev/null; then
        echo "RustFS exited during startup. See .local/rustfs.log." >&2
        exit 1
    fi
    sleep 1
done

echo "RustFS did not become ready within 60 seconds. See .local/rustfs.log." >&2
exit 1
