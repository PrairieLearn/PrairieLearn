from typing import List


def order_files(
    submitted_files: List[dict], required_file_names: List[str]
) -> List[dict]:
    # Build mapping from required file name to its index
    required_file_name_to_index = {
        required_file_name: idx
        for idx, required_file_name in enumerate(required_file_names)
    }

    # Sort submitted files by their index in the required file names list.
    # Any files that don't appear in `required_file_names` will be placed
    # at the end of the list.
    return sorted(
        submitted_files,
        key=lambda file: required_file_name_to_index.get(
            file.get("name", None), len(required_file_names)
        ),
    )
