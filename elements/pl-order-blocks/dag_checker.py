from collections import Counter
import networkx as nx

def check_topological_sorting(order, graph):
    seen = set()
    for i, node in enumerate(order):
        if node is None or not all([u in seen for (u,_) in graph.in_edges(node)]):
            return i, i
        seen.add(node)
    return len(order), -1

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
            return i, i
        elif group_id is not None and cur_group is not None:
            if group_id == cur_group:
                cur_group_size += 1
                if cur_group_size == group_sizes[cur_group]:
                    cur_group = None
                    cur_group_size = None
            else:
                return i, i
    return len(order), -1

def grade_dag(order, depends_graph, group_belonging):
    graph = nx.DiGraph()
    for node in depends_graph:
        for node2 in depends_graph[node]:
            graph.add_edge(node2, node)

    top_sort_correctness, top_sort_first_wrong = check_topological_sorting(order, graph)
    grouping_correctness, grouping_first_wrong = check_grouping(order, group_belonging)

    if top_sort_correctness < grouping_correctness:
        return top_sort_correctness, top_sort_first_wrong
    else:
        return grouping_correctness, grouping_first_wrong
