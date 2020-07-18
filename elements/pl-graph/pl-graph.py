import prairielearn as pl
import lxml.html
import chevron
import json
import pygraphviz
import numpy as np


ENGINE_DEFAULT = 'dot'
PARAMS_NAME_MATRIX_DEFAULT = None
PARAMS_NAME_LABELS_DEFAULT = None
WEIGHTS_DEFAULT = None
WEIGHTS_DIGITS_DEFAULT = 2
WEIGHTS_PRESENTATION_TYPE_DEFAULT = 'f'


def prepare(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    pl.check_attribs(element, required_attribs=[], optional_attribs=['engine', 'params-name-matrix', 'weights', 'weights-digits', 'weights-presentation-type', 'params-name-labels'])


def graphviz_from_matrix(mat, label, engine, element):
    # Get the matrix specific attributes

    show_weights = pl.get_boolean_attrib(element, 'weights', WEIGHTS_DEFAULT)  # by default display weights for stochastic matrices
    digits = pl.get_integer_attrib(element, 'weights-digits', WEIGHTS_DIGITS_DEFAULT)  # if displaying weights how many digits to round to
    presentation_type = pl.get_string_attrib(element, 'weights-presentation-type', WEIGHTS_PRESENTATION_TYPE_DEFAULT).lower()

    # Sanity checking

    if (mat.shape[0] != mat.shape[1]):
        raise Exception(f'Non-square adjacency matrix of size ({mat.shape[0]}, {mat.shape[1]}) given as input.')

    if label is not None:
        mat_label = label
        if (mat_label.shape[0] != mat.shape[0]):
            raise Exception(f'Dimension of the label ({mat_label.shape[0]}) is not consistent with the dimension of the matrix ({mat.shape[0]})')
    else:
        mat_label = range(mat.shape[1])

    # Auto detect showing weights if any of the weights are not 1 or 0

    if show_weights is None:
        all_ones = True
        for x in mat.flatten():
            if x != 1 and x != 0:
                all_ones = False
        show_weights = not all_ones

    # Create pygraphviz graph representation

    G = pygraphviz.AGraph(directed=True)

    for node in mat_label:
        G.add_node(node)

    for i, out_node in enumerate(mat_label):
        for j, in_node in enumerate(mat_label):
            x = mat[j, i]
            if (x > 0):
                if (show_weights):
                    G.add_edge(out_node, in_node, label=pl.string_from_2darray(x, presentation_type=presentation_type, digits=digits))
                else:
                    G.add_edge(out_node, in_node)

    G.layout(engine)
    return G.string()


def render(element_html, data):
    # Get attribs

    element = lxml.html.fragment_fromstring(element_html)
    engine = pl.get_string_attrib(element, 'engine', ENGINE_DEFAULT)
    input_param = pl.get_string_attrib(element, 'params-name-matrix', PARAMS_NAME_MATRIX_DEFAULT)
    input_label = pl.get_string_attrib(element, 'params-name-labels', PARAMS_NAME_LABELS_DEFAULT)

    if len(str(element.text)) == 0 and input_param is None:
        raise Exception('No graph source given! Must either define graph in HTML or provide source in params.')

    graphviz_data = None

    if input_param is not None:
        mat = np.array(pl.from_json(data['params'][input_param]))
        label = None
        if input_label is not None:
            label = np.array(pl.from_json(data['params'][input_label]))
        graphviz_data = json.dumps(graphviz_from_matrix(mat, label, engine, element))
    else:
        # Read the contents of this element as the data to render
        # we dump the string to json to ensure that newlines are
        # properly encoded
        graphviz_data = json.dumps(str(element.text))

    html_params = {
        'uuid': pl.get_uuid(),
        'workerURL': '/node_modules/viz.js/full.render.js',
        'data': graphviz_data,
        'engine': engine,
    }

    with open('pl-graph.mustache') as f:
        html = chevron.render(f, html_params).strip()

    return html
