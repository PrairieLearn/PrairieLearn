import os
import subprocess
import sys
from collections.abc import Generator
from contextlib import contextmanager


def get_env_or_exit(var: str) -> str:
    val = os.environ.get(var)
    if not val:
        print(f"{var} not specified!")
        sys.exit(1)
    return val


def print_and_run_command(command: list[str]) -> None:
    is_actions = os.environ.get("GITHUB_ACTIONS")
    if is_actions:
        print(f"[command]{' '.join(command)}")
    else:
        print(" ".join(command))

    # Flush `stdout` before running to ensure proper sequencing of output.
    sys.stdout.flush()

    subprocess.run(command, check=True)


@contextmanager
def local_registry(name: str) -> Generator[None, None, None]:
    # Stop any existing registry container.
    try:
        print_and_run_command(["docker", "stop", name])
        print_and_run_command(["docker", "rm", name])
    except subprocess.CalledProcessError:
        # The container probably didn't exist.
        pass

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
