from collections import Counter
import networkx as nx
import itertools
from copy import deepcopy


def check_topological_sorting(submission, graph):
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

def dag_to_nx(depends_graph):
    """Convert input graph format into NetworkX object to utilize their algorithms."""
    graph = nx.DiGraph()
    for node in depends_graph:
        graph.add_node(node)
        for node2 in depends_graph[node]:
            # the depends graph lists the *incoming* edges of a node
            graph.add_edge(node2, node)
    return graph

def grade_dag(submission, depends_graph):
    """In order for a student submission to a DAG graded question to be deemed correct, the student
    submission must be a topological sort of the DAG and blocks which are in the same pl-block-group
    as one another must all appear contiguously.
    :param submission: the block ordering given by the student
    :param depends_graph: The dependency graph between blocks specified in the question
    :param group_belonging: which pl-block-group each block belongs to, specified in the question
    :return: tuple containing length of list that meets both correctness conditions, starting from the beginning,
    and the length of any correct solution
    """
    graph = dag_to_nx(depends_graph)

    if not nx.is_directed_acyclic_graph(graph):
        raise Exception('Dependency between blocks does not form a Directed Acyclic Graph; Problem unsolvable.')

    top_sort_correctness = check_topological_sorting(submission, graph)

    return top_sort_correctness, graph.number_of_nodes()


def is_vertex_cover(G, vertex_cover):
    """ this function from
    https://docs.ocean.dwavesys.com/projects/dwave-networkx/en/latest/_modules/dwave_networkx/algorithms/cover.html#is_vertex_cover
    """
    cover = set(vertex_cover)
    return all(u in cover or v in cover for u, v in G.edges)


def lcs_partial_credit(submission, depends_graph, group_belonging):
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
    graph = dag_to_nx(depends_graph)
    trans_clos = nx.algorithms.dag.transitive_closure(graph)

    # if node1 must occur before node2 in any correct solution, but node2 occurs before
    # node1 in the submission, add them both and an edge between them to the problematic subgraph
    seen = set()
    problematic_subgraph = nx.DiGraph()
    distractors = 0
    for node1 in submission:
        # in the parse function of pl-order-blocks, lines that aren't in any
        # correct answer are denoted by None in the answer list
        if node1 is None:
            distractors += 1
            continue

        for node2 in seen:
            if trans_clos.has_edge(node1, node2):
                problematic_subgraph.add_edge(node1, node2)

        seen.add(node1)

    if problematic_subgraph.number_of_nodes() == 0:
        mvc_size = 0
    else:
        mvc_size = problematic_subgraph.number_of_nodes() - 1
        for i in range(1, problematic_subgraph.number_of_nodes() - 1):
            for subset in itertools.combinations(problematic_subgraph, i):
                # make sure deleting subset will resolve blocks out of order
                if is_vertex_cover(problematic_subgraph, subset):
                    break

            if mvc_size < problematic_subgraph.number_of_nodes() - 1:
                break

    deletions_needed = distractors + mvc_size
    insertions_needed = graph.number_of_nodes() - (len(submission) - deletions_needed)
    return deletions_needed + insertions_needed
