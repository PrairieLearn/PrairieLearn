import IPython.display as display
import numpy as np
import pygraphviz


def graph_matrix(mat, mat_label=None, show_weights=True, round_digits=3):
    class TempFile:
        def __init__(self):
            self.data = b""

        def write(self, data):
            self.data += data

        def get_bytes(self):
            return self.data

    if mat.shape[0] != mat.shape[1]:
        raise Exception(
            "Non-square adjacency matrix of size (%s,%s) given as input."
            % (mat.shape[0], mat.shape[1])
        )

    G = pygraphviz.AGraph(directed=True)

    if mat_label is None:
        mat_label = list(i for i in range(mat.shape[1]))

    for node in mat_label:
        G.add_node(node)

    for i, out_node in enumerate(mat_label):
        for j, in_node in enumerate(mat_label):
            x = mat[j, i]
            if x > 0:
                if show_weights:
                    G.add_edge(out_node, in_node, label=str(round(x, round_digits)))
                else:
                    G.add_edge(out_node, in_node)

    G.layout("dot")
    graphviz_data = G.string()

    buffer = TempFile()
    G.draw(buffer, format="png")
    display.display(display.Image(data=buffer.get_bytes(), format="png"))


"""
Examples
"""


def make_graph_adj_random(n):
    A = np.array([np.random.choice([0, 1]) for i in range(n**2)]).reshape(n, n)
    # A = np.array([[1, 1, 0, 0, 0],
    #               [1, 0, 0, 0, 1],
    #               [1, 1, 1, 0, 0],
    #               [0, 0, 1, 0, 0],
    #               [1, 0, 1, 0, 0]])
    graph_matrix(A, show_weights=False)
