import numpy as np
import prairielearn as pl
import pygraphviz

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

    graph = pygraphviz.AGraph(directed=True)

    for node in label:
        graph.add_node(node)

    edges, _ = mat.shape
    for e in range(edges):
        out_node = np.where(mat[e] == -1)[0][0]
        in_node = np.where(mat[e] == 1)[0][0]
        graph.add_edge(out_node, in_node)

    return graph.string()


backends = {"edge-inc-matrix": graphviz_from_inc_matrix}
