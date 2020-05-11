def generate(data):
    data["params"]["names_for_user"] = [
        {"name": "n", "description": r"Dimensionality of $\mathbf{A}$ and $\mathbf{b}$.", "type": "integer"},
        {"name": "A", "description": r"Matrix $\mathbf{A}$.", "type": "numpy array"},
        {"name": "b", "description": r"Vector $\mathbf{b}$.", "type": "numpy array"}
    ]
    data["params"]["names_from_user"] = [
        {"name": "x", "description": r"Solution to $\mathbf{Ax}=\mathbf{b}$.", "type": "numpy array"}
    ]
