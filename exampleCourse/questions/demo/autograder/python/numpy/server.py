def generate(data):
    data["params"]["names_for_user"] = [
        {"name": "n", "description": r"Dimensionality of $\mathbf{A}$ and $\mathbf{b}$.", "type": r"integer"},
        {"name": "A", "description": r"Matrix $\mathbf{A}$.", "type": r"numpy array ($n \times n$)"},
        {"name": "b", "description": r"Vector $\mathbf{b}$.", "type": r"numpy array (length $n$)"}
    ]
    data["params"]["names_from_user"] = [
        {"name": "x", "description": r"Solution to $\mathbf{Ax}=\mathbf{b}$.",
        "type": r"numpy array (length $n$)"}
    ]
