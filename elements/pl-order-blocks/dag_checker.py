from collections import Counter
from typing import Mapping, Optional
import networkx as nx  # type: ignore


def check_topological_sorting(order: list[str], graph: nx.DiGraph) -> int:
    seen = set()
    for i, node in enumerate(order):
        if node is None or not all(u in seen for (u, _) in graph.in_edges(node)):
            return i
        seen.add(node)
    return len(order)


def check_grouping(order: list[str], group_belonging: Mapping[str, Optional[int]]) -> int:
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


def grade_dag(order: list[str], depends_graph: Mapping[str, list[str]], group_belonging: Mapping[str, Optional[int]]) -> tuple[int, int]:
    """In order for a student submission to a DAG graded question to be deemed correct, the student
    submission must be a topological sort of the
    :param order: the block ordering given by the student
    :param depends_graph: The dependency graph between blocks specified in the question
    :param group_belonging: which pl-block-group each block belongs to, specified in the question
    :return: length of list that meets both correctness conditions, starting from the beginning,
    index of first wrong (-1 if none wrong)
    """
    graph = nx.DiGraph()
    for node in depends_graph:
        for node2 in depends_graph[node]:
            graph.add_edge(node2, node)

    if not nx.is_directed_acyclic_graph(graph):
        raise Exception('Dependency between blocks does not form a Directed Acyclic Graph; Problem unsolvable.')

    top_sort_correctness = check_topological_sorting(order, graph)
    grouping_correctness = check_grouping(order, group_belonging)

    correctness = top_sort_correctness if top_sort_correctness < grouping_correctness else grouping_correctness
    first_wrong = -1 if correctness == len(order) else correctness
    return correctness, first_wrong
