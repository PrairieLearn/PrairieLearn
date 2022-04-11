# https://gist.github.com/nicknytko/1dd749e5e3e3620ec0cc0aa8f2b70779

import numpy as np
import pygraphviz
import IPython.display as ipd

def _render_graph(graph, layout='dot'):
    class TempFile:
        def __init__(self):
            self.data = b''

        def write(self, data):
            self.data += data

        def get_bytes(self):
            return self.data

    graph.layout(layout)
    graphviz_data = graph.string()

    buffer = TempFile()
    graph.draw(buffer, format='svg')
    return ipd.display(ipd.SVG(buffer.get_bytes()))


def _draw_adj_matrix(mat, mat_label, show_weights, round_digits, directed, layout='dot'):
    G = pygraphviz.AGraph(directed=directed)

    for node in mat_label:
        G.add_node(node)

    for i, out_node in enumerate(mat_label):
        for j, in_node in enumerate(mat_label):
            x = mat[i, j]
            if (x > 0):
                if (show_weights):
                    G.add_edge(out_node, in_node, label=str(round(x, round_digits)))
                else:
                    G.add_edge(out_node, in_node)

    return _render_graph(G, layout)


def _draw_edge_inc_matrix(mat, mat_label, round_digits, layout='dot'):
    G = pygraphviz.AGraph(directed=True)

    for node in mat_label:
        G.add_node(node)

    edges, nodes = mat.shape
    for e in range(edges):
        out_node = np.where(mat[e] == -1)[0][0]
        in_node = np.where(mat[e] == 1)[0][0]
        G.add_edge(out_node, in_node)

    return _render_graph(G, layout)


def draw_matrix(mat, mat_label=None, show_weights=True, round_digits=3, directed=None, layout='dot'):
    '''
    Attempts to automatically determine the type of matrix by the type.
    A square matrix is interpreted to be an adjacency/stochastic matrix, while a non-square
    matrix is a edge-incidence matrix.
    '''

    mat = mat.T

    if len(mat.shape) != 2:
        raise Exception(f"Input matrix has wrong dimensionality (gotten {len(mat.shape)}, expected 2).")
    if directed is None:
        if mat.shape[0] == mat.shape[1]:
            directed = not np.allclose(mat.T, mat)
        else:
            directed = True
    if mat_label is None:
        mat_label = list(range(mat.shape[1]))

    if mat.shape[0] == mat.shape[1] and not np.any(mat < 0):
        return _draw_adj_matrix(mat, mat_label, show_weights, round_digits, directed, layout)
    else:
        return _draw_edge_inc_matrix(mat, mat_label, round_digits, layout)
