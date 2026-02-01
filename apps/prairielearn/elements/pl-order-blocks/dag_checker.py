import itertools
from collections import Counter
from collections.abc import Generator, Iterable, Mapping, Sequence
from copy import deepcopy

import networkx as nx
from typing_extensions import TypeIs

ColoredEdges = list[list[str]]
Edges = list[str]
Multigraph = dict[str, Edges | ColoredEdges]
Dag = dict[str, Edges]


def validate_grouping(
    graph: nx.DiGraph, group_belonging: Mapping[str, str | None]
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
        elif not all(
            group_belonging.get(dependency) == group_tag
            for (dependency, _) in graph.in_edges(node)
        ):
            return False
    return True


def solve_dag(
    depends_graph: Mapping[str, list[str]], group_belonging: Mapping[str, str | None]
) -> list[str]:
    """
    Solve the given problem

    - depends_graph: The dependency graph between blocks specified in the question
    - group_belonging: which pl-block-group each block belongs to, specified in the question

    Returns:
        - A list that is a topological sort of the input DAG with blocks in the
          same group occurring contiguously, making it a solution to the given
          problem
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


def solve_multigraph(
    depends_multi_graph: Multigraph,
    final_blocks: list[str],
) -> list[list[str]]:
    """Solve the given problem

    - depends_multi_graph: the dependency multi graph specified in the question
    - final: the sink of the multigraph

    Returns:
        - A list of lists that are a topological sort of the input MDAG making
          it a solution to the given problem
    """
    graphs = [
        dag_to_nx(graph, {})
        for graph in collapse_multigraph(depends_multi_graph, final_blocks)
    ]
    sort = [list(nx.topological_sort(graph)) for graph in graphs]
    return sort


def check_topological_sorting(
    submission: Sequence[str | None], graph: nx.DiGraph
) -> int:
    """
    - submission: candidate for topological sorting
    - graph: graph to check topological sorting over

    Returns:
        - Index of first element not topologically sorted, or length of list if
          sorted
    """
    seen = set()
    for i, node in enumerate(submission):
        if node is None or not all(u in seen for (u, _) in graph.in_edges(node)):
            return i
        seen.add(node)
    return len(submission)


def check_grouping(
    submission: Sequence[str | None], group_belonging: Mapping[str, str | None]
) -> int:
    """
    - submission: candidate solution
    - group_belonging: group that each block belongs to

    Returns:
        - Index of first element breaking condition that members of the same
          group must be adjacent, or length of list if they all meet the
          condition
    """
    group_sizes = Counter(group_belonging.values())
    cur_group = None
    cur_group_size = 0
    for i, node in enumerate(submission):
        group_id = None if node is None else group_belonging.get(node)
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
    depends_graph: Mapping[str, list[str]], group_belonging: Mapping[str, str | None]
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
        raise ValueError(
            "Dependency between blocks does not form a Directed Acyclic Graph; Problem unsolvable."
        )

    return graph


def add_edges_for_groups(
    graph: nx.DiGraph, group_belonging: Mapping[str, str | None]
) -> None:
    groups = {
        group: [tag for tag in group_belonging if group_belonging[tag] == group]
        for group in set(group_belonging.values())
        if group is not None
    }
    if not validate_grouping(graph, group_belonging):
        raise ValueError(
            "Blocks within in a `pl-block-group` are not allowed to depend on blocks outside their group."
        )

    # if a group G depends on a node N, all blocks in the group G should depend on Node N
    for group_tag, nodes in groups.items():
        for dependency, _ in graph.in_edges(group_tag):
            for node in nodes:
                graph.add_edge(dependency, node)

    # if a node N depends on a group G, node N should depend on all blocks in G
    for node in graph.nodes():
        for dependency, _ in deepcopy(graph.in_edges(node)):
            if dependency in groups:
                graph.add_edges_from([(tag, node) for tag in groups[dependency]])

    for group_tag in groups:
        graph.remove_node(group_tag)


def grade_dag(
    submission: Sequence[str | None],
    depends_graph: Mapping[str, list[str]],
    group_belonging: Mapping[str, str | None],
) -> tuple[int, int]:
    """
    In order for a student submission to a DAG graded question to be deemed correct, the student
    submission must be a topological sort of the DAG and blocks which are in the same pl-block-group
    as one another must all appear contiguously.

    - submission: the block ordering given by the student
    - depends_graph: The dependency graph between blocks specified in the question
    - group_belonging: which pl-block-group each block belongs to, specified in the question

    Returns:
        - Tuple containing the length of list that meets both correctness
          conditions, starting from the beginning, and the length of any
          correct solution
    """
    graph = dag_to_nx(depends_graph, group_belonging)

    top_sort_correctness = check_topological_sorting(submission, graph)
    grouping_correctness = check_grouping(submission, group_belonging)

    return min(top_sort_correctness, grouping_correctness), graph.number_of_nodes()


def grade_multigraph(
    submission: list[str],
    multigraph: Multigraph,
    final_blocks: list[str],
) -> tuple[int, int, Dag]:
    top_sort_correctness = []
    collapsed_dags = list(collapse_multigraph(multigraph, final_blocks))
    graphs = [dag_to_nx(graph, {}) for graph in collapsed_dags]
    for graph in graphs:
        sub = [x if x in graph.nodes() else None for x in submission]
        top_sort_correctness.append(check_topological_sorting(sub, graph))

    max_correct = max(top_sort_correctness)
    max_index = top_sort_correctness.index(max_correct)
    return max_correct, graphs[max_index].number_of_nodes(), collapsed_dags[max_index]


def is_vertex_cover(G: nx.DiGraph, vertex_cover: Iterable[str]) -> bool:
    """
    Taken from
    https://docs.ocean.dwavesys.com/en/stable/docs_dnx/reference/algorithms/generated/dwave_networkx.algorithms.cover.is_vertex_cover.html

    Returns:
        - If the set of vertices contains at least one end point of every edge
          of the provided graph.
    """
    cover = set(vertex_cover)
    return all(u in cover or v in cover for u, v in G.edges)


def lcs_partial_credit(
    submission: Sequence[str | None],
    depends_graph: Mapping[str, list[str]],
    group_belonging: Mapping[str, str | None],
) -> int:
    """
    Compute the number of edits required to change the student solution into a correct solution using
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
    - submission: the block ordering given by the student
    - depends_graph: The dependency graph between blocks specified in the question
    - group_belonging: which pl-block-group each block belongs to, specified in the question

    Returns:
        - Edit distance from the student submission to some correct solution
    """
    graph = dag_to_nx(depends_graph, group_belonging)
    trans_clos = nx.transitive_closure(graph)
    submission_no_distractors = [
        node for node in submission if node in depends_graph and node is not None
    ]

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
                group_belonging[x] == group_belonging[node1]
                for x in submission_no_distractors[i : j + 1]
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


def dfs_until(
    multigraph: Multigraph,
    start: str,
) -> tuple[tuple[str, ColoredEdges] | None, Dag]:
    """
    Depth-First searches a multigraph until a node meets some specified requirements and then halts
    searching and returns the node or the reason for halting.

    - multigraph: the multigraph being searched.
    - start: the starting point for the search.

    Returns:
        The reason or node that halted the search with the nodes and their
        corresponding edges the DFS was able to reach before halting.

    Raises:
        - If a cycle is found in the multigraph.
    """  # noqa: DOC501 (false positive)
    # ruff throws an error for sphinx style doc strings: https://github.com/astral-sh/ruff/issues/12434
    stack: list[tuple[str, list[str]]] = []
    visited: list[str] = []
    traversed: Dag = {}
    stack.append((start, visited))
    while stack:
        curr, visited = stack.pop(0)
        visited.append(curr)

        edges = multigraph[curr]

        if has_colored_edges(edges):
            return (curr, edges), traversed

        traversed[curr] = edges
        for target in edges:
            # this determines if the proposed target edge is a back edge if so it contains a cycle
            if target in visited and visited.index(curr) >= visited.index(target):
                raise ValueError("Cycle encountered during collapse of multigraph.")
            if target not in visited:
                stack.insert(0, (target, deepcopy(visited)))

    return None, traversed


def collapse_multigraph(
    multigraph: Multigraph,
    final_blocks: list[str],
) -> Generator[Dag]:
    """
    This algorithm takes a directed multigraph structure where multiple edges
    can exist from a any single node to any other single node multiple times.
    This allows for us to encode multiple DAGs within a single structure. This
    algorithm with its use of dfs_until allows the parsing of those valid DAGs
    out of the multigraph. The algorithm functions as follows:
        1. Iterate through the partially collapsed multigraphs in the
           collapsing_graphs queue.
        2. Perform a depth first search on the graph until either the source
           has been found or a colored edge.
        3. When a colored edge has been found replace the colored edges with
           one of the enumerated colored edges in a new copy of the multigraph.
        4. If the entire graph has been traversed it is a valid DAG and it can
           be returned.
    For more details, see the paper: https://arxiv.org/abs/2510.11999
    - multigraph: a dependency graph that contains nodes with multiple colored
      edges.
    - final: the sink in the multigraph, necessary to know the sink so that we
      have a starting point for the DFS to search for DAGs through the
      multigraph.

    Yields:
        - yields a "fully collapsed" DAG once a DAG has been found.

    NOTE: This isn't the most performant implementation becuase it is not
    memoizing the returned position from dfs_until in already traversed graphs.
    Work is being redone, however, most graphs will have very few nodes and the
    tradeoff for the extra code complexity does not seem worth it at this time.
    """
    for final in final_blocks:
        collapsing_graphs: list[Multigraph] = [multigraph]
        while collapsing_graphs:
            graph = collapsing_graphs.pop(0)
            reason, dag = dfs_until(graph, final)

            # DFS halted because source was reached
            if reason is None:
                yield dag
                continue

            # DFS halted for has_colored_edges, split graph into their respective partially collapsed graphs
            node, edges = reason
            for color in edges:
                partially_collapsed = deepcopy(graph)
                partially_collapsed[node] = color
                collapsing_graphs.append(partially_collapsed)


def has_colored_edges(edges: Edges | ColoredEdges) -> TypeIs[ColoredEdges]:
    """A halting condition function for dfs_until, used to check for colored edges."""
    return any(isinstance(edge, list) for edge in edges)
