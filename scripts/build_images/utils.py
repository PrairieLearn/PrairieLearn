import contextlib
import json
import os
import subprocess
import sys
from collections.abc import Generator
from contextlib import contextmanager


def get_env_or_exit(var: str) -> str:
    """Get an environment variable or exit with an error message."""
    val = os.environ.get(var)
    if not val:
        print(f"{var} not specified!")
        sys.exit(1)
    return val


def print_and_run_command(
    command: list[str], *, capture_output: bool = False
) -> subprocess.CompletedProcess[str]:
    """Run a command and print it to the console.

    If running in GitHub Actions, the command is formatted for better output.
    """
    is_actions = os.environ.get("GITHUB_ACTIONS")
    if is_actions:
        print(f"[command]{' '.join(command)}")
    else:
        print(" ".join(command))

    # Flush `stdout` before running to ensure proper sequencing of output.
    sys.stdout.flush()

    return subprocess.run(
        command, check=True, capture_output=capture_output, encoding="utf-8"
    )


def get_current_platform() -> str:
    """Get the current platform using Docker CLI."""
    result = subprocess.run(
        ["docker", "version", "--format", "json"],
        capture_output=True,
        check=True,
    )
    version_data = json.loads(result.stdout)
    return f"{version_data['Server']['Os']}/{version_data['Server']['Arch']}"


@contextmanager
def local_registry(name: str) -> Generator[None, None, None]:
    """Create a local Docker registry."""
    # Stop any existing registry container.
    with contextlib.suppress(subprocess.CalledProcessError):
        print_and_run_command(["docker", "stop", name], capture_output=True)
        print_and_run_command(["docker", "rm", name], capture_output=True)

    print("Starting local Docker registry...")
    print_and_run_command(["docker", "pull", "registry:2"])
    print_and_run_command(
        [
            "docker",
            "run",
            "-d",
            "-p",
            "5000:5000",
            # Put the registry storage in a tmpfs for faster reads and writes.
            "--tmpfs=/var/lib/registry",
            "--name",
            name,
            "registry:2",
        ],
    )

    try:
        yield
    finally:
        print("Stopping local Docker registry.")
        print_and_run_command(["docker", "stop", name])
        print_and_run_command(["docker", "rm", name])


@contextmanager
def buildx_builder(name: str) -> Generator[None, None, None]:
    """Create a Docker buildx builder."""
    # Remove any existing builder with the same name.
    with contextlib.suppress(subprocess.CalledProcessError):
        print_and_run_command(["docker", "buildx", "rm", name], capture_output=True)

    print("Creating buildx builder...")
    print_and_run_command(
        [
            "docker",
            "buildx",
            "create",
            "--name",
            name,
            "--driver",
            "docker-container",
            "--driver-opt",
            "network=host",
        ],
    )

    try:
        yield
    finally:
        print("Removing buildx builder...")
        print_and_run_command(["docker", "buildx", "rm", name])
