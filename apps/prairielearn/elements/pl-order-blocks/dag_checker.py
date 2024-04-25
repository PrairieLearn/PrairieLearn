import itertools
from collections import Counter
from copy import deepcopy
from typing import Iterable, Mapping, Optional

import networkx as nx


def validate_grouping(
    graph: nx.DiGraph, group_belonging: Mapping[str, Optional[str]]
) -> bool:
    for node in graph:
        group_tag = group_belonging.get(node)
        if group_tag is None:
            if (
                sum(
                    group_belonging.get(dependency) is not None
                    for (dependency, _) in graph.in_edges(node)
                )
                != 0
            ):
                return False
        else:
            if not all(
                group_belonging.get(dependency) == group_tag
                for (dependency, _) in graph.in_edges(node)
            ):
                return False
    return True


def solve_dag(
    depends_graph: Mapping[str, list[str]], group_belonging: Mapping[str, Optional[str]]
) -> list[str]:
    """Solve the given problem
    :param depends_graph: The dependency graph between blocks specified in the question
    :param group_belonging: which pl-block-group each block belongs to, specified in the question
    :return: a list that is a topological sort of the input DAG with blocks in the same group occuring
    contiguously, making it a solution to the given problem
    """
    graph = dag_to_nx(depends_graph, group_belonging)
    sort = list(nx.topological_sort(graph))

    # We need to ensure that blocks from the same block group occur contiguously. Because we enforce the syntactic
    # constraint that dependence relationships (edges in the DAG) can't cross group boundaries, we can move
    # blocks in each group back earlier to be next to one another while maintaining a topological sort.
    groups = set(group_belonging.values())
    groups.remove(None)
    for group_tag in groups:
        group = [node for node in sort if group_belonging[node] == group_tag]
        group_start = sort.index(group[0])
        not_in_group = [node for node in sort if group_belonging[node] != group_tag]
        sort = not_in_group[:group_start] + group + not_in_group[group_start:]

    return sort


def check_topological_sorting(submission: list[str], graph: nx.DiGraph) -> int:
    """
    :param submission: candidate for topological sorting
    :param graph: graph to check topological sorting over
    :return: index of first element not topologically sorted, or length of list if sorted
    """
    seen = set()
    for i, node in enumerate(submission):
        if node is None or not all(u in seen for (u, _) in graph.in_edges(node)):
            return i
        seen.add(node)
    return len(submission)


def check_grouping(
    submission: list[str], group_belonging: Mapping[str, Optional[str]]
) -> int:
    """
    :param submission: candidate solution
    :param group_belonging: group that each block belongs to
    :return: index of first element breaking condition that members of the same group must be
    adjacent, or length of list if they all meet the condition
    """
    group_sizes = Counter(group_belonging.values())
    cur_group = None
    cur_group_size = 0
    for i, node in enumerate(submission):
        group_id = group_belonging.get(node)
        if group_id is not None and cur_group is None:
            cur_group = group_id
        elif group_id is None and cur_group is not None:
            return i

        if group_id is not None and cur_group is not None:
            if group_id == cur_group:
                cur_group_size += 1
                if cur_group_size == group_sizes[cur_group]:
                    cur_group = None
                    cur_group_size = 0
            else:
                return i
    return len(submission)


def dag_to_nx(
    depends_graph: Mapping[str, list[str]], group_belonging: Mapping[str, Optional[str]]
) -> nx.DiGraph:
    """Convert input graph format into NetworkX object to utilize their algorithms."""
    graph = nx.DiGraph()
    for node in depends_graph:
        graph.add_node(node)
        for node2 in depends_graph[node]:
            # the depends graph lists the *incoming* edges of a node
            graph.add_edge(node2, node)

    add_edges_for_groups(graph, group_belonging)

    if not nx.is_directed_acyclic_graph(graph):
        raise Exception(
            "Dependency between blocks does not form a Directed Acyclic Graph; Problem unsolvable."
        )

    return graph


def add_edges_for_groups(
    graph: nx.DiGraph, group_belonging: Mapping[str, Optional[str]]
) -> None:
    groups = {
        group: [tag for tag in group_belonging if group_belonging[tag] == group]
        for group in set(group_belonging.values())
        if group is not None
    }
    if not validate_grouping(graph, group_belonging):
        raise Exception(
            "Blocks within in a `pl-block-group` are not allowed to depend on blocks outside their group."
        )

    # if a group G depends on a node N, all blocks in the group G should depend on Node N
    for group_tag in groups:
        for dependency, _ in graph.in_edges(group_tag):
            for node in groups[group_tag]:
                graph.add_edge(dependency, node)

    # if a node N depends on a group G, node N should depend on all blocks in G
    for node in graph.nodes():
        for dependency, _ in deepcopy(graph.in_edges(node)):
            if dependency in groups:
                graph.add_edges_from([(tag, node) for tag in groups[dependency]])

    for group_tag in groups:
        graph.remove_node(group_tag)


def grade_dag(
    submission: list[str],
    depends_graph: Mapping[str, list[str]],
    group_belonging: Mapping[str, Optional[str]],
) -> tuple[int, int]:
    """In order for a student submission to a DAG graded question to be deemed correct, the student
    submission must be a topological sort of the DAG and blocks which are in the same pl-block-group
    as one another must all appear contiguously.
    :param submission: the block ordering given by the student
    :param depends_graph: The dependency graph between blocks specified in the question
    :param group_belonging: which pl-block-group each block belongs to, specified in the question
    :return: tuple containing length of list that meets both correctness conditions, starting from the beginning,
    and the length of any correct solution
    """
    graph = dag_to_nx(depends_graph, group_belonging)

    top_sort_correctness = check_topological_sorting(submission, graph)
    grouping_correctness = check_grouping(submission, group_belonging)

    return min(top_sort_correctness, grouping_correctness), graph.number_of_nodes()


def is_vertex_cover(G: nx.DiGraph, vertex_cover: Iterable[str]) -> bool:
    """this function from
    https://docs.ocean.dwavesys.com/en/stable/docs_dnx/reference/algorithms/generated/dwave_networkx.algorithms.cover.is_vertex_cover.html
    """
    cover = set(vertex_cover)
    return all(u in cover or v in cover for u, v in G.edges)


def lcs_partial_credit(
    submission: list[str],
    depends_graph: Mapping[str, list[str]],
    group_belonging: Mapping[str, Optional[str]],
) -> int:
    """Computes the number of edits required to change the student solution into a correct solution using
    largest common subsequence edit distance (allows only additions and deletions, not replacing).
    The naive solution would be to enumerate all topological sorts, then get the edit distance to each of them,
    but this would be too slow. Instead, our algorithm is as follows:
        1. Remove all distractors from the student solution
        2. Construct the 'problematic subgraph'. We do this by finding the subset of nodes in the
        graph that have some 'problematic' relation, meaning that there is a node before it in the
        student solution that should be after it, or one after it that must be before, or nodes that
        belong to the same pl-block-group are not contiguous with one another.
        3. Find the minimum set of nodes to delete from the submission which will solve all problematic
        relationships found in step 2.
        4. Once we know the minimum required deletions, you may simply add nodes to the student
        solution until it is the correct solution, so you can directly calculate the edit distance.
    For more details, see the paper: https://arxiv.org/abs/2204.04196
    :param submission: the block ordering given by the student
    :param depends_graph: The dependency graph between blocks specified in the question
    :param group_belonging: which pl-block-group each block belongs to, specified in the question
    :return: edit distance from the student submission to some correct solution
    """
    graph = dag_to_nx(depends_graph, group_belonging)
    trans_clos = nx.transitive_closure(graph)
    submission_no_distractors = [node for node in submission if node in depends_graph]

    # if node1 must occur before node2 in any correct solution, but node2 occurs before
    # node1 in the submission, add them both and an edge between them to the problematic subgraph
    seen = set()
    problematic_subgraph = nx.DiGraph()
    for node1 in submission_no_distractors:
        for node2 in seen:
            if trans_clos.has_edge(node1, node2):
                problematic_subgraph.add_edge(node1, node2)
        seen.add(node1)

    # if two nodes are in the same `pl-block-group`, but don't occur next to one another in the
    # submission, add them and all nodes in between to the problematic subgraph
    for i in range(len(submission_no_distractors)):
        for j in range(i + 2, len(submission_no_distractors)):
            node1, node2 = submission_no_distractors[i], submission_no_distractors[j]
            if group_belonging.get(node1) is None or group_belonging.get(
                node1
            ) != group_belonging.get(node2):
                continue
            if not all(
                [
                    group_belonging[x] == group_belonging[node1]
                    for x in submission_no_distractors[i : j + 1]
                ]
            ):
                problematic_subgraph.add_nodes_from(
                    submission_no_distractors[i : j + 1]
                )

    if problematic_subgraph.number_of_nodes() == 0:
        mvc_size = 0
    else:
        mvc_size = problematic_subgraph.number_of_nodes() - 1
        for i in range(1, problematic_subgraph.number_of_nodes() - 1):
            for subset in itertools.combinations(problematic_subgraph, i):
                # make sure deleting subset will resolve blocks out of order
                if not is_vertex_cover(problematic_subgraph, subset):
                    continue

                # make sure deleting subset will resolve a separated pl-block-group
                edited_submission = [
                    x for x in submission_no_distractors if x not in subset
                ]
                edited_group_belonging = {
                    key: group_belonging.get(key) for key in edited_submission
                }
                if len(edited_submission) == check_grouping(
                    edited_submission, edited_group_belonging
                ):
                    mvc_size = len(subset)
                    break

            if mvc_size < problematic_subgraph.number_of_nodes() - 1:
                break

    num_distractors = len(submission) - len(submission_no_distractors)
    deletions_needed = num_distractors + mvc_size
    insertions_needed = graph.number_of_nodes() - (len(submission) - deletions_needed)
    return deletions_needed + insertions_needed
