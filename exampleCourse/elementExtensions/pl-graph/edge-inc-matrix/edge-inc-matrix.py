import prairielearn as pl
import pygraphviz
import numpy as np


# Import the host element for all the attrib defaults
pl_graph = pl.load_host_script("pl-graph.py")


def graphviz_from_inc_matrix(element, data):
    # Get attributes

    engine = pl.get_string_attrib(element, 'engine', pl_graph.ENGINE_DEFAULT)
    input_param = pl.get_string_attrib(element, 'params-name-matrix', pl_graph.PARAMS_NAME_MATRIX_DEFAULT)
    input_label = pl.get_string_attrib(element, 'params-name-labels', pl_graph.PARAMS_NAME_LABELS_DEFAULT)
    mat = np.array(pl.from_json(data['params'][input_param]))
    show_weights = pl.get_boolean_attrib(element, 'weights', pl_graph.WEIGHTS_DEFAULT)  # by default display weights for stochastic matrices
    digits = pl.get_integer_attrib(element, 'weights-digits', pl_graph.WEIGHTS_DIGITS_DEFAULT)  # if displaying weights how many digits to round to
    presentation_type = pl.get_string_attrib(element, 'weights-presentation-type', pl_graph.WEIGHTS_PRESENTATION_TYPE_DEFAULT).lower()

    label = None
    if input_label is not None:
        label = np.array(pl.from_json(data['params'][input_label]))

    # Sanity check
    if label is not None and label.shape[0] != mat.shape[0]:
        raise Exception('Dimensionality of the label is not consistent with the dimensionality of the matrix')

    if label is None:
        label = range(mat.shape[1])

    G = pygraphviz.AGraph(directed=True)

    for node in label:
        G.add_node(node)

    edges, nodes = mat.shape
    for e in range(edges):
        out_node = np.where(mat[e] == -1)[0][0]
        in_node = np.where(mat[e] == 1)[0][0]
        G.add_edge(out_node, in_node)

    return G.string()


backends = {
    'edge-inc-matrix': graphviz_from_inc_matrix
}
