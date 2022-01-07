from typing import Mapping, Optional, Iterable
from collections import Counter
import networkx as nx
import itertools


def check_topological_sorting(order: list[str], graph: nx.DiGraph) -> int:
    """
    :param order: candidate for topological sorting
    :param graph: graph to check topological sorting over
    :return: index of first element not topologically sorted, or length of list if sorted
    """
    seen = set()
    for i, node in enumerate(order):
        if node is None or not all(u in seen for (u, _) in graph.in_edges(node)):
            return i
        seen.add(node)
    return len(order)


def check_grouping(order: list[str], group_belonging: Mapping[str, Optional[int]]) -> int:
    """
    :param order: candidate solution
    :param group_belonging: group that each block belongs to
    :return: index of first element breaking condition that members of the same group must be
    adjacent, or length of list if they all meet the condition
    """
    group_sizes = Counter(group_belonging.values())
    cur_group = None
    cur_group_size = 0
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
                    cur_group_size = 0
            else:
                return i
    return len(order)


def dag_to_nx(depends_graph: Mapping[str, list[str]]) -> nx.DiGraph:
    """Convert input graph format into NetworkX object to utilize their algorithms."""
    graph = nx.DiGraph()
    for node in depends_graph:
        for node2 in depends_graph[node]:
            # the depends graph lists the *incoming* edges of a node
            graph.add_edge(node2, node)
    return graph


def grade_dag(order: list[str], depends_graph: Mapping[str, list[str]], group_belonging: Mapping[str, Optional[int]]) -> int:
    """In order for a student submission to a DAG graded question to be deemed correct, the student
    submission must be a topological sort of the DAG and blocks which are in the same pl-block-group
    as one another must all appear contiguously.
    :param order: the block ordering given by the student
    :param depends_graph: The dependency graph between blocks specified in the question
    :param group_belonging: which pl-block-group each block belongs to, specified in the question
    :return: length of list that meets both correctness conditions, starting from the beginning
    """
    graph = dag_to_nx(depends_graph)

    if not nx.is_directed_acyclic_graph(graph):
        raise Exception('Dependency between blocks does not form a Directed Acyclic Graph; Problem unsolvable.')

    top_sort_correctness = check_topological_sorting(order, graph)
    grouping_correctness = check_grouping(order, group_belonging)

    return top_sort_correctness if top_sort_correctness < grouping_correctness else grouping_correctness


def is_vertex_cover(G: nx.DiGraph, vertex_cover: Iterable):
    """ this function from
    https://docs.ocean.dwavesys.com/projects/dwave-networkx/en/latest/_modules/dwave_networkx/algorithms/cover.html#is_vertex_cover
    """
    cover = set(vertex_cover)
    return all(u in cover or v in cover for u, v in G.edges)


def lcs_partial_credit(order: list[str], depends_graph: Mapping[str, list[str]], group_belonging: Mapping[str, Optional[int]]) -> int:
    """Computes the number of edits required to change the student solution into a correct solution using
    largest common subsequence edit distance (allows only additions and deletions, not replacing).
    The naive solution would be to enumerate all topological sorts, then get the edit distance to each of them,
    but this would be too slow. Instead, our algorithm is as follows:
        1. Remove all distractors from the student solution
        2. Construct the 'problematic subgraph'. We do this by finding the subset of nodes in the
        graph that have some 'problematic' relation, meaning that there is a node before it in the
        student solution that should be after it, or one after it that must be before. Thus the
        edge (u,v) is in the problematic subgraph if there is an edge from u to v in the transitive
        closure of the dependency graph, but v appears before u in the student solution.
        3. Find the Minimum Vertex Cover (MVC) of the problematic subgraph. This tells us the
        minimum number of nodes that must be deleted to get rid of all problematic relations.
        4. Once we know the minimum required deletions, you may simply add nodes to the student
        solution until it is the correct solution, so you can directly calculate the edit distance.
    :param order: the block ordering given by the student
    :param depends_graph: The dependency graph between blocks specified in the question
    :return: edit distance from the student submission to some correct solution
    """
    graph = dag_to_nx(depends_graph)
    trans_clos = nx.algorithms.dag.transitive_closure(graph)

    seen = set()
    problematic_subgraph = nx.DiGraph()
    distractors = 0
    for node in order:
        # in the parse function of pl-order-blocks, lines that aren't in any
        # correct answer are denoted by None in the answer list
        if node is None:
            distractors += 1
            continue

        for node2 in seen:
            if trans_clos.has_edge(node, node2):
                problematic_subgraph.add_edge(node, node2)

        seen.add(node)

    for i in range(len(order)):
        for j in range(i + 2, len(order)):
            node1, node2 = order[i], order[j]
            if group_belonging[node1] is None or group_belonging[node1] != group_belonging[node2]:
                continue
            if not all([group_belonging[x] == group_belonging[node1] for x in order[i:j+1]]):
                for node in order[i:j+1]:
                    problematic_subgraph.add_node(node)


    if problematic_subgraph.number_of_nodes() == 0:
        mvc_size = 0
    else:
        mvc_size = problematic_subgraph.number_of_nodes() - 1
        for i in range(1, problematic_subgraph.number_of_nodes() - 1):
            for subset in itertools.combinations(problematic_subgraph, i):
                new_order = [x for x in order if x in subset]
                new_group_belonging = {key: group_belonging[key] for key in new_order}
                if is_vertex_cover(problematic_subgraph, subset) and len(new_order) == check_grouping(new_order, new_group_belonging):
                    mvc_size = len(subset)
                    break
            if mvc_size < problematic_subgraph.number_of_nodes() - 1:
                break

    deletions_needed = distractors + mvc_size
    insertions_needed = len(depends_graph.keys()) - (len(order) - deletions_needed)
    return deletions_needed + insertions_needed
