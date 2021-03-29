//  Data for testing
// const testData = `<?xml version="1.0" encoding="UTF-8"?><mxfile host="app.diagrams.net" modified="2021-02-24T04:09:02.214Z" agent="5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.182 Safari/537.36" etag="kN_1SOBbov589jEQl0Ha" version="14.4.2"><diagram id="4wXPHjGsfcsBOBC4T4IS" name="Page-1">1VbbjpswEP0aHltxTdLHbpLetKtWitTby8rCU/DKYGrMAv36GhguhiRKV23aSjwwxzNjzzkzBsvbJtVrSbL4TlDglmvTyvJ2lus6vutazWPTukPWdtABkWQUnUbgwH4AgjaiBaOQG45KCK5YZoKhSFMIlYERKUVpun0T3Nw1IxEsgENI+BL9xKiKO3QT2CP+BlgU9zs7Nq4kpHdGII8JFeUE8vaWt5VCqO4tqbbAG/J6Xrq4VydWh4NJSNUlAffvN/u8fEHydzf3Xz++fbgt7uJn6y7LI+EFFlwCk7QnD0+u6p4OoJodNIVUsYhESvh+RG+kKFIKzZ62tkafWyEyDToafAClapSaFEpoKFYJx1WomPrchD9fB2h+mSztKkzdGjUa3UGb051kB6FcFDKEM5T0XUZkBOqMnz9oqJsfRAJK1jpOAieKPZrnINiF0eA3CqVfUKtf0M1Z6JZ/L3SxC8FMOcqYKThkpCWg1BNrUo9JQSqozvO4rLsPWGG747w7G7TLcXqcfiTiyeT0cb+dKndBVctJK1WoSBrxc6w5V2EtCEzWXP9vs+YtWFveBSl92V4S3i7kJM9ZeIyXq86ke5zlCYvBERJ77OLRxR0+CKYLGUT0bVNE352J05WJUdObep5o1g3eepao42GRqBV6KPvp2vunJmbeAJzrzzBcZUK8VWBy4l04IZs/NSGrf2pCTnyN/rPOn308VvPr7cmNr83xT6tzH/9Xvf1P</diagram></mxfile>`


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
    // Set to testData for testing
    // data = testData

    var responseRoot = stringToXML(data);
    if (!responseRoot) {
        console.error("Error parsing response XML");
    } else {

        // Process compressed XML to get the XML representing the graph
        var diagramNode = responseRoot.getElementsByTagName("diagram")[0];
        var compressedXML = diagramNode.textContent
        compressedXML = atob(compressedXML);  // TODO: Check compatability of atob() with older browsers and catch errors
        compressedXML = data = pako.inflateRaw(Uint8Array.from(compressedXML, c => c.charCodeAt(0)), { to: 'string' });
        compressedXML = decodeURIComponent(compressedXML);

        // Process XML representing graph into graph data structure
        var graphModelNode = stringToXML(compressedXML);
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
                let node = {}
                node[idAttr] = valueAttr;
                graph.nodes.push(node);
            }
        }
        var inputElement = document.getElementById("diagramHiddenInput");
        var graphString = JSON.stringify(graph);
        inputElement.setAttribute("value", graphString);
    }
}
