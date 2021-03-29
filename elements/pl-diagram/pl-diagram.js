//  Data for testing


/**Parse string into Document */
function stringToXML(str) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(str, 'text/xml');
    return doc.documentElement;
}

function parseMxCellStyle(str) {
    if (str == null) { return null; }
    var styleDict = {}
    var entries = str.split(";");
    for (let entry of entries) {
        let keyValPair = entry.split("=", 2);
        styleDict[keyValPair[0]] = keyValPair[1];
    }
    return styleDict;
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
        compressedXML = atob(compressedXML);  // TODO: Use atob from npm
        compressedXML = data = pako.inflateRaw(Uint8Array.from(compressedXML, c => c.charCodeAt(0)), { to: 'string' });
        compressedXML = decodeURIComponent(compressedXML);

        // Process XML representing graph into graph data structure
        var graphModelNode = stringToXML(compressedXML);
        console.log(graphModelNode)
        var graphRoot = graphModelNode.getElementsByTagName("root")[0]
        var graphComponentList = graphRoot.getElementsByTagName("mxCell"); // Get all mxCell objects to process into graph
        var graph = {
            nodes: [
                //{nodeID: nodeName}
            ],
            edges: [
                //[nodeInID, nodeOutID]
            ]
        }
        for (let component of graphComponentList) {
            var idAttr = component.getAttribute("id");
            var valueAttr = component.getAttribute("value");
            var styleAttrs = parseMxCellStyle(component.getAttribute("style"));
            var nodeInID = component.getAttribute("source");
            var nodeOutID = component.getAttribute("target");
            if (nodeInID || nodeOutID) { // Is an edge
                graph.edges.push([nodeInID, nodeOutID]);
            } else if (styleAttrs) { // Is a node
                let node = {};
                node[idAttr] = valueAttr;
                graph.nodes.push(node);
            }
        }
        var inputElement = document.getElementById("diagramHiddenInput");
        var graphString = JSON.stringify(graph);
        inputElement.setAttribute("value", graphString);
    }
}
