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
import re
import booleanParser
import itertools

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

    outputTag = ",".join([a + "=?" for a in outputs])
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
            nodeObject = SubElement(root, 'object', {"elemType": "node", "id": str(id), 'label': outputTag})
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
                    "style": "edgeLabel;html=1;align=center;verticalAlign=middle;resizable=0;points=[];fontSize=11;movable=0;pointerEvents=1;deletable=0;cloneable=0;rotatable=0;allowArrows=0;",
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


def parseAnswerFSMFromXML(element):
    """Parse answer FSM from <pl-fsm/> into an adjacency list structure"""
    graph = {"edges": {}, "nodes": {}}
    inputs = pl.get_string_attrib(element, 'input', None)
    outputs = pl.get_string_attrib(element, 'output', None)
    startState = pl.get_string_attrib(element, 'start', None)
    if inputs is None or outputs is None:
        raise Exception('input and output are required in pl-fsm')
    if startState is None:
        raise Exception('start state is required for pl-fsm answer')
    inputs = literal_eval(inputs)
    outputs = literal_eval(outputs)
    for a in inputs:
        if len(a) != 1:
            raise Exception('Invalid input for pl-fsm')
    for a in outputs:
        if len(a) != 1:
            raise Exception('Invalid output for pl-fsm')
    graph['inputs'] = inputs
    graph['outputs'] = outputs
    graph['start'] = startState
    max_transitions = 2**len(outputs)
    for pl_state_element in element:
        if pl_state_element.tag == "pl-fsm-state":
            stateName = pl.get_string_attrib(pl_state_element, 'name', None)
            if stateName in graph['nodes']:
                raise Exception("Duplicate statename in pl-diagram-answer")
            stateTransitions = pl.get_string_attrib(pl_state_element, 'transitions', None)
            if stateTransitions is None:
                stateTransitions = [""] * max_transitions
            else:
                stateTransitions = literal_eval(stateTransitions)
            stateOutputs = pl.get_string_attrib(pl_state_element, 'output', None)
            stateOutputs = tuple(literal_eval(stateOutputs))
            graph['nodes'][stateName] = stateOutputs
            graph['edges'][stateName] = []
            for i, dest in enumerate(stateTransitions):
                graph["edges"][stateName].append([dest, i])
    return graph


def prepare(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name', None)
    for child in element:
        if child.tag == "pl-diagram-initial":
            for initialComponent in child:
                if initialComponent.tag == "pl-fsm":
                    xmlString = parseInitialFSMToXML(initialComponent)
                    data['params']['initial-xml'] = xmlString.decode("utf-8")
                    break
        elif child.tag == "pl-diagram-answer":
            for initialComponent in child:
                if initialComponent.tag == "pl-fsm":
                    data['correct_answers'][name] = parseAnswerFSMFromXML(initialComponent)
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
    except json.JSONDecodeError:
        data['format_errors'][name] = 'No submitted answer.'
        data['submitted_answers'][name] = {}
    return data


def grade(element_html, data):
    np.random.seed(0)
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name', element_defaults['answers-name'])
    student = data['submitted_answers'][name]
    reference = data['correct_answers'][name]
    outputAlphabet = reference['outputs']
    inputAlphabet = reference['inputs']
    # Syntax check node outputs
    print(student)
    outputIndices = {k: v for v, k in enumerate(outputAlphabet)}
    for node in student['nodes']:
        if node not in student['edges']:
            data['format_errors'][name] = f"Node has no outoging edges: {student['nodes'][node][0]}"
            return data
        nodeStr = re.sub(r'[ \r\n]|(\<br\>)', '', student['nodes'][node][1])  # Strip whitespace
        nodeOutputs = [None] * len(outputIndices)
        tokens = nodeStr.split(',')
        if len(tokens) != len(outputIndices):
            data['format_errors'][name] = "Too many outputs"
            return data
        for token in tokens:
            if len(token) != 3 or token[0] not in outputIndices or token[1] != '=' or token[2] not in ['0', '1']:
                data['format_errors'][name] = f"Node output incorrectly formatted: {token}"
                return data
            nodeOutputs[outputIndices[token[0]]] = token[2]
        student['nodes'][node] = (student['nodes'][node][0], tuple(nodeOutputs))
    validChars = {'(', ')', '\'', '*', '+'}
    for char in inputAlphabet:
        validChars.add(char)
    for nodeIn in student['nodes']:
        for edge in student['edges'][nodeIn]:
            edgeLabel = re.sub(r'[ \r\n]|(\<br\>)', '', edge[1])  # Strip whitespace
            for c in edgeLabel:
                if c not in validChars:
                    data['format_errors'][name] = f"Edge transition incorrectly formatted: {edgeLabel}"
                    return data
            edge[1] = edgeLabel
    print(student)
    print(reference)
    # Second order checks to make sure only one transition exists for each assignment of input booleans
    allAssignments = list(itertools.product([True, False], repeat=len(inputAlphabet)))
    for nodeIn in student['nodes']:
        numTrue = [0] * len(allAssignments)  # Each entry should be exactly 1 after interating all edges (One entry for each assignment)
        for edge in student['edges'][nodeIn]:
            edgeAST = booleanParser.create_ast(edge[1])
            for i, assignment in enumerate(allAssignments):
                asDict = {inputAlphabet[j]: assignment[j] for j in range(len(inputAlphabet))}
                result = booleanParser.eval_ast(edgeAST, asDict)
                if result:
                    numTrue[i] = numTrue[i] + 1
        # Check if any assignments are under/over satisfied
        for i, x in enumerate(numTrue):
            if x == 0:
                data['format_errors'][name] = f"Node {student['nodes'][nodeIn][1]} is missing transition for {allAssignments[i]}"
                print(data['format_errors'][name])
                return data
            if x > 1:
                data['format_errors'][name] = f"Node {student['nodes'][nodeIn][1]} has too many transitions for {allAssignments[i]}"
                print(data['format_errors'][name])
                return data
    print("Pass 2nd order check")
    # Random checks
    CASE_SIZE = 10
    testCase = np.random.choice([0, 1], size=(CASE_SIZE, len(inputAlphabet)), replace=True)
    studentOutput = []
    referenceOutput = []
    # evaluate student FSM
    currState = student['start']
    for row in testCase:
        assignment = {inputAlphabet[j]: row[j] for j in range(len(inputAlphabet))}
        for edge in student['edges'][currState]:
            edgeAST = booleanParser.create_ast(edge[1])
            if(booleanParser.eval_ast(edgeAST, assignment)):
                currState = edge[0]
                output = tuple(int(i) for i in student['nodes'][currState][1])
                studentOutput.append(output)
                break
    # evaluate reference FSM
    currState = reference['start']
    for row in testCase:
        toBin = int("".join(str(x) for x in row), 2)
        for edge in reference['edges'][currState]:
            if edge[1] == toBin:
                currState = edge[0]
                output = tuple(reference['nodes'][currState])
                referenceOutput.append(output)
                break
    # compare outputs
    numCorrect = 0
    for i in range(CASE_SIZE):
        if studentOutput[i] == referenceOutput[i]:
            numCorrect += 1
    print(studentOutput)
    print(referenceOutput)
    print(f"{numCorrect} out of {CASE_SIZE}")
    return data


def test(element_html, data):
    return
