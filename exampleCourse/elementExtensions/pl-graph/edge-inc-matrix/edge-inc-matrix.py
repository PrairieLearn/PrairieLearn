import numpy as np
import prairielearn as pl

# Import the host element for all the attrib defaults
pl_graph = pl.load_host_script("pl-graph.py")


def graphviz_from_inc_matrix(element, data):
    # Get attributes

    input_param = pl.get_string_attrib(
        element, "params-name", pl_graph.PARAMS_NAME_DEFAULT
    )
    input_label = pl.get_string_attrib(
        element, "params-name-labels", pl_graph.PARAMS_NAME_LABELS_DEFAULT
    )
    mat = np.array(pl.from_json(data["params"][input_param]))

    label = None
    if input_label is not None:
        label = np.array(pl.from_json(data["params"][input_label]))

    # Sanity check
    if label is not None and label.shape[0] != mat.shape[0]:
        raise TypeError(
            "Dimensionality of the label is not consistent with the dimensionality of the matrix"
        )

    if label is None:
        label = range(mat.shape[1])

    lines = ["strict digraph {"]
    lines.extend(f"\t{pl_graph.dot_node_id(node)};" for node in label)

    edges, _ = mat.shape
    for e in range(edges):
        out_node = label[np.where(mat[e] == -1)[0][0]]
        in_node = label[np.where(mat[e] == 1)[0][0]]
        lines.append(
            f"\t{pl_graph.dot_node_id(out_node)} -> {pl_graph.dot_node_id(in_node)};"
        )

    lines.append("}")
    return "\n".join(lines) + "\n"


backends = {"edge-inc-matrix": graphviz_from_inc_matrix}
