import itertools
import random
import string

import networkx as nx
import numpy as np
import numpy.linalg as la
import prairielearn as pl


def generate(data):
    data["params"]["weight1"] = random.randint(1, 10)
    data["params"]["weight2"] = random.randint(1, 10)

    mat = np.random.random((3, 3))
    mat = mat / la.norm(mat, 1, axis=0)
    data["params"]["labels"] = pl.to_json(["A", "B", "C"])
    data["params"]["matrix"] = pl.to_json(mat)
    data["params"]["symmetric_matrix"] = pl.to_json(np.maximum(mat, mat.T))

    mat2 = np.random.binomial(1, 0.5, (3, 3))
    data["params"]["matrix2"] = pl.to_json(mat2)

    mat3 = np.array([[None, 2, -1.5], [-1.1, -1.4, None], [None, 4, -2]])
    data["params"]["matrix3"] = pl.to_json(mat3)

    # chosen by dice roll, guaranteed to be random
    edge_mat = np.array([[-1, 0, 1, 0], [0, -1, 1, 0], [1, 0, 0, -1], [0, 1, -1, 0]])
    data["params"]["edge-inc-mat"] = pl.to_json(edge_mat)

    random_graph = nx.gnm_random_graph(5, 6)

    for in_node, out_node, edge_data in random_graph.edges(data=True):
        edge_data["label"] = random.choice(string.ascii_lowercase)

    data["params"]["random-graph"] = pl.to_json(random_graph)

    multigraph = nx.MultiDiGraph(
        [(1, 2), (2, 1), (1, 2), (1, 3), (3, 2), (2, 3)], rankdir="LR"
    )

    data["params"]["multigraph"] = pl.to_json(multigraph)

    # Generation code for color graph
    subset_sizes = [5, 5, 4, 3, 2, 4, 4, 3]
    subset_color = [
        "gold",
        "violet",
        "violet",
        "violet",
        "violet",
        "limegreen",
        "limegreen",
        "darkorange",
    ]

    extents = nx.utils.pairwise(itertools.accumulate((0,) + tuple(subset_sizes)))
    layers = [range(start, end) for start, end in extents]
    layered_graph = nx.Graph()
    for i, (layer, color) in enumerate(zip(layers, subset_color)):
        layered_graph.add_nodes_from(layer, layer=i, color=color)

    for layer1, layer2 in nx.utils.pairwise(layers):
        layered_graph.add_edges_from(itertools.product(layer1, layer2), color="blue")

    data["params"]["color-graph"] = pl.to_json(layered_graph)
