# `pl-graph` element

Using the [PyGraphviz](https://pygraphviz.github.io/) library, create Graphviz DOT visualizations.

## Sample elements

![Screenshot of the pl-graph element using graphviz syntax](pl-graph1.png)

```html title="question.html"
<pl-graph> digraph G { A -> B } </pl-graph>
```

---

![Screenshot of the pl-graph element using a matrix](pl-graph2.png)

```html title="question.html"
<pl-graph params-name="matrix" params-name-labels="labels"></pl-graph>
```

```python title="server.py"
import prairielearn as pl
import numpy as np

def generate(data):
    mat = np.random.random((3, 3))
    mat = mat / np.linalg.norm(mat, 1, axis=0)
    data["params"]["labels"] = pl.to_json(["A", "B", "C"])
    data["params"]["matrix"] = pl.to_json(mat)
```

---

```html title="question.html"
<pl-graph params-type="networkx" params-name="random-graph"></pl-graph>
```

```python title="server.py"
import prairielearn as pl
import networkx as nx

def generate(data):
    random_graph = nx.gnm_random_graph(5, 6)

    for in_node, out_node, edge_data in random_graph.edges(data=True):
        edge_data["label"] = random.choice(string.ascii_lowercase)

    data["params"]["random-graph"] = pl.to_json(random_graph)
```

## Customizations

| Attribute                   | Type    | Default              | Description                                                                                                                                                                                                                                                                   |
| --------------------------- | ------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `directed`                  | boolean | true                 | Whether to treat edges in an adjacency matrix as directed or undirected. If set to false, then edges will be rendered as undirected. _The input adjacency matrix must be symmetric if this is set to false._                                                                  |
| `directory`                 | string  | `"."`                | Directory where the source file is located. Can be `"."` (question directory), `"clientFilesCourse"`, or `"serverFilesCourse"`.                                                                                                                                               |
| `engine`                    | string  | dot                  | The rendering engine to use; supports `"circo"`, `"dot"`, `"fdp"`, `"neato"`, `"osage"`, and `"twopi"`.                                                                                                                                                                       |
| `log-warnings`              | boolean | true                 | Whether to log warnings that occur during Graphviz rendering.                                                                                                                                                                                                                 |
| `negative-weights`          | boolean | false                | Whether to recognize negative weights in an adjacency matrix. If set to false, then all weights at most 0 are ignored (not counted as an edge). If set to true, then all weights that are not `None` are recognized.                                                          |
| `params-name`               | string  | —                    | The name of a parameter containing the data to use as input. Data type to use depends on `params-type` attribute.                                                                                                                                                             |
| `params-name-labels`        | string  | —                    | When using an adjacency matrix, the parameter that contains the labels for each node.                                                                                                                                                                                         |
| `params-type`               | string  | `"adjacency-matrix"` | Which backend to use for rendering a graph from data. By default, only `adjacency-matrix` and `networkx` exist, but custom types can be added through extensions.                                                                                                             |
| `source-file-name`          | string  | —                    | Name of the file to load graph content from. If provided, the file content will be used instead of the element's inner HTML. Useful for complex graphs with special characters like angle brackets in record-based nodes.                                                     |
| `weights`                   | boolean | —                    | When using an adjacency matrix, whether to show the edge weights. By default, will automatically show weights for stochastic matrices (when they are not binary `0`/`1`).                                                                                                     |
| `weights-digits`            | integer | 2                    | When using an adjacency matrix, how many digits to show for the weights.                                                                                                                                                                                                      |
| `weights-presentation-type` | string  | `"f"`                | Number display format for the weights when using an adjacency matrix. If `presentation-type` is `"sigfig"`, each number is formatted using the `to_precision` module to digits significant figures. Otherwise, each number is formatted as `{:.{digits}{presentation-type}}`. |

## Details

Note that using networkx for rendering, attributes from the input networkx graph are retained when creating a Graphviz DOT visualization. As a result, it is possible to set node and edge properties such as color, line weight, as part of the input graph and have these reflected in the rendering. These include global properties of the graph, such as the `rankdir` used in rendering. See the [Graphviz documentation on attributes](https://graphviz.org/doc/info/attrs.html) for more information on what attributes are supported. The currently used Graphviz version is 2.44.0.

The `source-file-name` attribute is particularly useful when working with static graphs that contain special characters like angle brackets (`<>`), which are used in [record-based nodes](https://graphviz.org/doc/info/shapes.html#record) but can interfere with HTML parsing. By placing the graph content in an external file, you can avoid the need to escape these characters.

## Example implementations

- [element/graph]

## Extension API

Custom values for `params-type` can be added with [element extensions](../elementExtensions.md). Each custom type is defined as a function that takes as input the `element` and `data` values and returns processed DOT syntax as output.

A minimal type function can look something like:

```python
def custom_type(element, data):
    return "graph { a -- b; }"
```

In order to register these custom types, your extension should define the global `backends` dictionary. This will map a value of `params-type` to your function above:

```python
backends = {
    'my-custom-type': custom_type
}
```

This will automatically get picked up when the extension gets imported. If your extension needs extra attributes to be defined, you may optionally define the global `optional_attribs` array that contains a list of attributes that the element may use.

For a full implementation, check out the `edge-inc-matrix` extension in the exampleCourse.

## See also

- [External: the DOT language reference](https://graphviz.org/doc/info/lang.html)
- [`pl-figure` for displaying static or dynamically generated graphics.](pl-figure.md)
- [`pl-file-download` for allowing either static or dynamically generated files to be downloaded.](pl-file-download.md)

---

[element/graph]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/element/graph
