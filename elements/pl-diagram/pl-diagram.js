
function parseDiagram(data) {
    // Set to testData
    data = testData
    //
    var rawXML;
    if (window.DOMParser) {
        var parser = new DOMParser();
        rawXML = parser.parseFromString(data, 'text/xml');
    }
    else {
        var result = createXmlDocument();
        result.async = 'false';
        result.loadXML(data);
        rawXML = result;
    }
    console.log(rawXML.documentElement)
}