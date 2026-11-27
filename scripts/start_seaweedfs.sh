#!/bin/bash
set -euo pipefail

# Work around lsof hanging in the Amazon Linux container on some hosts.
ulimit -Sn 4096

pid=$(lsof -nP -iTCP:5000 -sTCP:LISTEN -t || true)
started=false
if [[ -n "$pid" ]]; then
    process_name=$(ps -p "$pid" -o args=)
    if ! grep -q '[w]eed server' <<< "$process_name" \
        || ! grep -Fq -- "-s3.config=$PWD/scripts/seaweedfs-s3.json" <<< "$process_name"; then
        echo "Cannot start SeaweedFS: port 5000 is already in use by process $pid." >&2
        if [[ "$(uname)" == "Darwin" ]] && grep -q 'ControlCenter' <<< "$process_name"; then
            echo "This might be caused by AirPlay Receiver: https://apple.stackexchange.com/questions/431154" >&2
        fi
        exit 1
    fi
else
    for port in 8080 8888 9333 15000 18080 18888 19333; do
        if lsof -nP -iTCP:"$port" -sTCP:LISTEN -t > /dev/null; then
            echo "Cannot start SeaweedFS: port $port is already in use." >&2
            exit 1
        fi
    done
    if [[ -x "$PWD/.local/bin/weed" ]]; then
        weed="$PWD/.local/bin/weed"
    elif command -v weed > /dev/null; then
        weed=$(command -v weed)
    else
        echo "SeaweedFS is not installed. Run make seaweedfs-deps." >&2
        exit 1
    fi

    mkdir -p .local/seaweedfs
    WEED_LEVELDB2_DIR="$PWD/.local/seaweedfs/filer" \
        "$weed" server -ip=127.0.0.1 -ip.bind=127.0.0.1 -dir="$PWD/.local/seaweedfs" \
        -master.telemetry=false -volume.max=1000 -filer -s3 -s3.port=5000 \
        -s3.port.iceberg=0 -s3.port.lance=0 \
        -s3.config="$PWD/scripts/seaweedfs-s3.json" > .local/seaweedfs.log 2>&1 &
    pid=$!
    started=true
fi

for ((i = 0; i < 60; i++)); do
    if lsof -nP -iTCP:5000 -sTCP:LISTEN -t | grep -qx "$pid"; then
        if node scripts/init_seaweedfs.mjs; then
            exit 0
        fi
        if [[ "$started" == true ]]; then
            kill "$pid" 2> /dev/null || true
        fi
        echo "Failed to initialize SeaweedFS buckets. See .local/seaweedfs.log." >&2
        exit 1
    fi
    if ! kill -0 "$pid" 2> /dev/null; then
        echo "SeaweedFS exited during startup. See .local/seaweedfs.log." >&2
        exit 1
    fi
    sleep 1
done

if [[ "$started" == true ]]; then
    kill "$pid" 2> /dev/null || true
fi
echo "SeaweedFS did not become ready within 60 seconds. See .local/seaweedfs.log." >&2
exit 1
