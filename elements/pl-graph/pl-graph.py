import prairielearn as pl
import lxml.html
import chevron
import json
import pygraphviz
import numpy as np


ENGINE_DEFAULT = 'dot'
PARAMS_NAME_MATRIX_DEFAULT = None
PARAMS_NAME_LABELS_DEFAULT = None
PARAMS_TYPE_DEFAULT = 'adjacency-matrix'
WEIGHTS_DEFAULT = None
WEIGHTS_DIGITS_DEFAULT = 2
WEIGHTS_PRESENTATION_TYPE_DEFAULT = 'f'
SHOW_NEGATIVE_WEIGHTS_DEFAULT = False


def graphviz_from_adj_matrix(element: lxml.html.HtmlElement, data: pl.QuestionData) -> str:
    # Get matrix attributes

    engine = pl.get_string_attrib(element, 'engine', ENGINE_DEFAULT)
    input_param = pl.get_string_attrib(element, 'params-name-matrix', PARAMS_NAME_MATRIX_DEFAULT)
    input_label = pl.get_string_attrib(element, 'params-name-labels', PARAMS_NAME_LABELS_DEFAULT)
    show_negative_weights = pl.get_string_attrib(element, 'show-negative-weights', SHOW_NEGATIVE_WEIGHTS_DEFAULT)
    mat = np.array(pl.from_json(data['params'][input_param]))
    show_weights = pl.get_boolean_attrib(element, 'weights', WEIGHTS_DEFAULT)  # by default display weights for stochastic matrices
    digits = pl.get_integer_attrib(element, 'weights-digits', WEIGHTS_DIGITS_DEFAULT)  # if displaying weights how many digits to round to
    presentation_type = pl.get_string_attrib(element, 'weights-presentation-type', WEIGHTS_PRESENTATION_TYPE_DEFAULT).lower()

    label = None
    if input_label is not None:
        label = np.array(pl.from_json(data['params'][input_label]))

    # Sanity checking

    if (mat.shape[0] != mat.shape[1]):
        raise ValueError(f'Non-square adjacency matrix of size ({mat.shape[0]}, {mat.shape[1]}) given as input.')

    if label is not None:
        mat_label = label
        if (mat_label.shape[0] != mat.shape[0]):
            raise ValueError(f'Dimension of the label ({mat_label.shape[0]}) is not consistent with the dimension of the matrix ({mat.shape[0]})')
    else:
        mat_label = range(mat.shape[1])

    # Auto detect showing weights if any of the weights are not 1 or 0

    if show_weights is None:
        show_weights = any(
            x not in {0, 1} for x in mat.flatten()
        )

    # Create pygraphviz graph representation

    G = pygraphviz.AGraph(directed=True)
    G.add_nodes_from(mat_label)

    for in_node, row in zip(mat_label, mat):
        for out_node, x in zip(mat_label, row):
            if (show_negative_weights) or x > 0:
                if (show_weights):
                    G.add_edge(out_node, in_node, label=pl.string_from_2darray(x, presentation_type=presentation_type, digits=digits))
                else:
                    G.add_edge(out_node, in_node)

    G.layout(engine)
    return G.string()


MATRIX_BACKENDS = {
    'adjacency-matrix': graphviz_from_adj_matrix
}


def prepare(element_html: str, data: pl.QuestionData) -> None:
    optional_attribs = ['engine', 'params-name-matrix', 'weights', 'weights-digits', 'weights-presentation-type', 'params-name-labels', 'params-type', 'show-negative-weights']

    # Load attributes from extensions if they have any
    extensions = pl.load_all_extensions(data)
    for extension in extensions.values():
        if hasattr(extension, 'optional_attribs'):
            optional_attribs.extend(extension.optional_attribs)

    element = lxml.html.fragment_fromstring(element_html)
    pl.check_attribs(element, required_attribs=[], optional_attribs=optional_attribs)


def render(element_html: str, data: pl.QuestionData) -> str:
    # Load all extensions
    extensions = pl.load_all_extensions(data)
    for extension in extensions.values():
        backends = extension.backends
        for name, backend in backends.items():
            MATRIX_BACKENDS[name] = backend

    # Get attribs
    element = lxml.html.fragment_fromstring(element_html)
    engine = pl.get_string_attrib(element, 'engine', ENGINE_DEFAULT)
    input_param = pl.get_string_attrib(element, 'params-name-matrix', PARAMS_NAME_MATRIX_DEFAULT)
    input_type = pl.get_string_attrib(element, 'params-type', PARAMS_TYPE_DEFAULT)

    if len(str(element.text)) == 0 and input_param is None:
        raise ValueError('No graph source given! Must either define graph in HTML or provide source in params.')

    if input_param is not None:
        if input_type in MATRIX_BACKENDS:
            graphviz_data = json.dumps(MATRIX_BACKENDS[input_type](element, data))
        else:
            raise ValueError(f'Unknown graph type "{input_type}".')
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
        return chevron.render(f, html_params).strip()
