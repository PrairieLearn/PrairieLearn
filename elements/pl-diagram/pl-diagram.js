/**Parse string into Document */
function stringToXML(str) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(str, 'text/xml');
    return doc.documentElement;
}

/** Helper to set list value in dictionary if list exists, otherwise initalize new list and set value  */
function setDictList(dict, dictKey, listIdx, value, isNode) {
    if (!(dictKey in dict)) {
        dict[dictKey] = isNode ? [undefined, undefined] : [undefined, undefined, undefined];
    }
    dict[dictKey][listIdx] = value;
}

/** Parse encoded XML diagram returned by draw.io */
function parseDiagram(data) {
    var responseRoot = stringToXML(data);
    if (!responseRoot) {
        console.error("Error parsing response XML");
    } else {

        // Process compressed XML to get the XML representing the graph
        var diagramNode = responseRoot.getElementsByTagName("diagram")[0];
        var compressedXML = diagramNode.textContent
        compressedXML = atob(compressedXML);
        compressedXML = data = pako.inflateRaw(Uint8Array.from(compressedXML, c => c.charCodeAt(0)), { to: 'string' });
        compressedXML = decodeURIComponent(compressedXML);

        // Process XML representing graph into graph data structure
        var graph = {
            nodes: {
                //nodeID: [name, output] -- the nodeID is the ID of the container of both the node and node label
            },
            edges: {
                //edgeID: [nodeInID, nodeOutID, transition] -- the nodeID is the ID of the container of both the node and label
            }
        }
        var graphModelNode = stringToXML(compressedXML);
        var graphRoot = graphModelNode.getElementsByTagName("root")[0]

        var graphComponentList = graphRoot.getElementsByTagName("object"); // Get all objects to process into graph
        // First pass to process nodes
        for (let component of graphComponentList) {
            let elementType = component.getAttribute("elemType");
            let componentMX = component.getElementsByTagName("mxCell")[0];
            if (elementType == "node") {
                let nodeID = componentMX.getAttribute("parent");
                setDictList(graph.nodes, nodeID, 1, component.getAttribute("label"), true);
            }
            else if (elementType == "nodeLabel") {
                let nodeID = componentMX.getAttribute("parent");
                setDictList(graph.nodes, nodeID, 0, component.getAttribute("label"), true);
            }
        }
        // Second pass to process edges
        for (let component of graphComponentList) {
            let elementType = component.getAttribute("elemType");
            let componentMX = component.getElementsByTagName("mxCell")[0];
            if (elementType == "edge") {
                let edgeID = component.getAttribute("id");
                setDictList(graph.edges, edgeID, 0, componentMX.getAttribute("source"), false);
                setDictList(graph.edges, edgeID, 1, componentMX.getAttribute("target"), false);
            }
            else if (elementType == "edgeLabel") {
                let edgeID = componentMX.getAttribute("parent");
                setDictList(graph.edges, edgeID, 2, component.getAttribute("label"), false);
            }
        }
        // Restructure graph data structure to adjacency list
        edgeDict = {}
        for (let key in graph.edges) {
            let edge = graph.edges[key];
            let nodeIn = edge[0];
            if (!(nodeIn in edgeDict)) { edgeDict[nodeIn] = []; }
            edgeDict[edge[0]].push([edge[1], edge[2]]);
        }
        graph.edges = edgeDict;
        console.log(graph);
        var inputElement = document.getElementById("diagramHiddenInput");
        var graphString = JSON.stringify(graph);
        inputElement.setAttribute("value", graphString);
    }
}
