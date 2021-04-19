import lxml.html
from html import escape
import chevron
import math
import prairielearn as pl
import numpy as np
import random
import json
from ast import literal_eval
from xml.dom import minidom
from xml.etree.ElementTree import Element, SubElement, Comment
from xml.etree import ElementTree

element_defaults = {
    'answers-name': '',
}


def labelFromTransition(i):
    # TODO: Generate transition label "i+j'" from index of transition array
    return "label here"


def parseInitialFSMToXML(element):
    """Parse initial FSM from <pl-fsm/> into an XML loadable into draw.io"""
    inputs = pl.get_string_attrib(element, 'input', None)
    outputs = pl.get_string_attrib(element, 'output', None)
    if inputs is None or outputs is None:
        raise Exception('input and output are required in pl-fsm')
    inputs = literal_eval(inputs)
    outputs = literal_eval(outputs)
    for a in inputs:
        if len(a) != 1:
            raise Exception('Invalid input for pl-fsm')
    for a in outputs:
        if len(a) != 1:
            raise Exception('Invalid output for pl-fsm')
    max_transitions = 2**len(outputs)
    # Begin xml file
    mxFile = Element('mxfile')
    diagramXML = SubElement(mxFile, 'diagram', {"id": "diagram-id"})
    mxGraphModel = SubElement(diagramXML, 'mxGraphModel')
    root = SubElement(mxGraphModel, 'root')
    mxCell0 = SubElement(root, 'mxCell', {"id": "0"})
    mxCell1 = SubElement(root, 'mxCell', {"id": "1", "parent": "0"})

    id = 2         # Unique id for any XML object

    nodeDict = {}  # {nodeName->id}

    for pl_state_element in element:
        if pl_state_element.tag == "pl-fsm-state":
            stateName = pl.get_string_attrib(pl_state_element, 'name', None)
            stateTransitions = pl.get_string_attrib(pl_state_element, 'transitions', None)
            x1 = pl.get_integer_attrib(pl_state_element, 'x1', None)
            y1 = pl.get_integer_attrib(pl_state_element, 'y1', None)
            if stateTransitions is None:
                stateTransitions = [""] * max_transitions
            else:
                stateTransitions = literal_eval(stateTransitions)
            # if node doesn't exist, add it to dictionary
            if stateName not in nodeDict:
                nodeDict[stateName] = str(id)
                id += 1

            # Create node in XML
            nodeID = nodeDict[stateName]
            # Create node container
            nodeCell = SubElement(root, 'mxCell', {
                "id": nodeID,
                "style": "group;allowArrows=0;connectable=1;resizable=0;rotatable=0;cloneable=0;deletable=1;editable=0;movableLabel=0;comic=0;dropTarget=0;expand=1;pointerEvents=0;perimeter=calloutPerimeter;",
                "vertex": "1",
                "connectable": "0",
                "parent": "1",
            })
            nodeGeometry = SubElement(nodeCell, 'mxGeometry', {"x": str(x1), "y": str(y1), "width": "90", "height": "120", "as": "geometry"})
            # Create node circle
            nodeObject = SubElement(root, 'object', {"label": "o=?", "elemType": "node", "id": str(id)})
            id += 1
            nodeCell = SubElement(nodeObject, 'mxCell', {
                "style": "ellipse;whiteSpace=wrap;html=1;aspect=fixed;fontStyle=0;connectable=0;allowArrows=0;resizable=0;rotatable=0;cloneable=0;deletable=0;movable=0;noLabel=0;editable=1;dropTarget=0;container=0;expand=0;",
                "vertex": "1",
                "connectable": "0",
                "parent": nodeID,
            })
            nodeGeometry = SubElement(nodeCell, 'mxGeometry', {"width": "90", "height": "90", "as": "geometry"})
            # Create node label
            nodeObject = SubElement(root, 'object', {"label": stateName, "elemType": "nodeLabel", "id": str(id)})
            id += 1
            nodeCell = SubElement(nodeObject, 'mxCell', {
                "style": "text;html=1;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;whiteSpace=wrap;rounded=0;labelBackgroundColor=#ffffff;fontSize=11;allowArrows=0;connectable=0;deletable=0;cloneable=0;rotatable=0;movable=0;resizable=0;pointerEvents=0;",
                "vertex": "1",
                "connectable": "0",
                "parent": nodeID,
            })
            nodeGeometry = SubElement(nodeCell, 'mxGeometry', {"x": "25", "y": "100", "width": "40", "height": "20", "as": "geometry"})

            # iterate edges
            for i in range(max_transitions):
                dest = stateTransitions[i]
                if(dest == ""):
                    continue
                if dest not in nodeDict:
                    nodeDict[dest] = str(id)
                    id += 1
                # Add edge
                edgeObject = SubElement(root, 'object', {"elemType": "edge", "id": str(id)})
                id += 1
                edgeCell = SubElement(edgeObject, 'mxCell', {
                    "style": "endArrow=classic;html=1;fontStyle=0;fontSize=11;editable=0;cloneable=0;deletable=1;",
                    "edge": "1",
                    "parent": "1",
                    "source": nodeDict[stateName],
                    "target": nodeDict[dest]
                })
                edgeGeometry = SubElement(edgeCell, 'mxGeometry', {"width": "50", "height": "50", "relative": "1", "as": "geometry"})
                # Add edge label
                edgeObject = SubElement(root, 'object', {"label": labelFromTransition(i), "elemType": "edgeLabel", "id": str(id)})
                id += 1
                edgeCell = SubElement(edgeObject, 'mxCell', {
                    "style": "edgeLabel;html=1;align=center;verticalAlign=middle;resizable=0;points=[];fontSize=11;movable=0;pointerEvents=0;deletable=0;cloneable=0;rotatable=0;allowArrows=0;",
                    "vertex": "1",
                    "connectable": "0",
                    "parent": str(id - 2),
                })
                edgeGeometry = SubElement(edgeCell, 'mxGeometry', {"x": "0.1201", "relative": "1", "as": "geometry"})
                # Handle self loop
                if dest == stateName:
                    # TODO: Handle self loops
                    pass
    # print(minidom.parseString(ElementTree.tostring(mxFile, 'utf-8')).toprettyxml(indent="  "))
    return ElementTree.tostring(mxFile, 'utf-8')


def prepare(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    for child in element:
        if child.tag == "pl-diagram-initial":
            for initialComponent in child:
                if initialComponent.tag == "pl-fsm":
                    xmlString = parseInitialFSMToXML(initialComponent)
                    data['params']['initial-xml'] = xmlString.decode("utf-8")
                    break
            break


def render(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name', element_defaults['answers-name'])
    html_params = {"name": name, "initial-xml": data['params']['initial-xml']}
    with open('pl-diagram.mustache', 'r', encoding='utf-8') as f:
        html = chevron.render(f, html_params).strip()
    return html


def parse(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name', element_defaults['answers-name'])
    try:
        data['submitted_answers'][name] = json.loads(data['submitted_answers'][name])
        if 'nodes' not in data['submitted_answers'][name] or 'edges' not in data['submitted_answers'][name]:
            data['format_errors'][name] = 'No submitted answer.'
            data['submitted_answers'][name] = {}
        print(data['submitted_answers'][name])
    except json.JSONDecodeError:
        data['format_errors'][name] = 'No submitted answer.'
        data['submitted_answers'][name] = {}
    return


def grade(element_html, data):
    return


def test(element_html, data):
    return
