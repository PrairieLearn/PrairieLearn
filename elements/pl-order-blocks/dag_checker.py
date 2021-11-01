from collections import Counter
import networkx as nx


def check_topological_sorting(order, graph):
    seen = set()
    for i, node in enumerate(order):
        if node is None or not all([u in seen for (u, _) in graph.in_edges(node)]):
            return i
        seen.add(node)
    return len(order)


def check_grouping(order, group_belonging):
    group_sizes = Counter(group_belonging.values())
    cur_group = None
    cur_group_size = None
    for i, node in enumerate(order):
        group_id = group_belonging.get(node)
        if group_id is not None and cur_group is None:
            cur_group = group_id
            cur_group_size = 1
        elif group_id is None and cur_group is not None:
            return i
        elif group_id is not None and cur_group is not None:
            if group_id == cur_group:
                cur_group_size += 1
                if cur_group_size == group_sizes[cur_group]:
                    cur_group = None
                    cur_group_size = None
            else:
                return i
    return len(order)


def grade_dag(order, depends_graph, group_belonging):
    graph = nx.DiGraph()
    for node in depends_graph:
        for node2 in depends_graph[node]:
            graph.add_edge(node2, node)

    if not nx.is_directed_acyclic_graph(graph):
        raise Exception("Dependency between blocks does not form a Directed Acyclic Graph; Problem unsolvable.")

    top_sort_correctness = check_topological_sorting(order, graph)
    grouping_correctness = check_grouping(order, group_belonging)

    correctness = top_sort_correctness if top_sort_correctness < grouping_correctness else grouping_correctness
    first_wrong = -1 if correctness == len(order) else correctness
    return correctness, first_wrong
