
//var canvas;

var caretTimer;
var caretVisible = true;

var nodes = [];
var links = [];

var stateNamesToHighlight = null
var transitionsToHighlight = null

const snapToPadding = 6; // pixels
const hitTargetPadding = 6; // pixels
const smallStateSize = 25; // pixels
const largeStateSize = 40; // pixels

var nodeRadius = largeStateSize; // Default to large state size
var cursorVisible = true;
var selectedObject = null; // either a Link or a Node
var currentLink = null; // a Link
var movingObject = false;
var originalClick;
var answersName = null;
var alphabetList = null;
var fsmTypeName = '';

var state_limit = 0;
var checkbox = null;

var shift = false;


class FSMBuilder {

constructor(name, backupJson, formatErrorsJson, alphabet, fsmType, editable, max_states=0) {
    answersName = name;
    fsmTypeName = fsmType;
    alphabetList = alphabet;
    this.canvas = document.getElementById(answersName + '-fsm-canvas');

    state_limit = max_states;
    checkbox = document.getElementById(answersName+'-include-dump-state')

    this.restoreBackup(backupJson);
    this.setFormatErrors(formatErrorsJson);
    this.draw();

    // If not editable, we don't allow the user to modify anything, so just exit
    if (!editable) {
      return;
    }


    this.canvas.onmousedown = (e) => {
        var mouse = this.crossBrowserRelativeMousePos(e);
        selectedObject = this.selectObject(mouse.x, mouse.y);
        movingObject = false;
        originalClick = mouse;

        if (selectedObject != null) {
            if (shift && selectedObject instanceof Node) {
                currentLink = new SelfLink(selectedObject, mouse);
            } else {
                movingObject = true;
                //deltaMouseX = deltaMouseY = 0;
                if (selectedObject.setMouseStart) {
                    selectedObject.setMouseStart(mouse.x, mouse.y);
                }
            }
            this.resetCaret();
        } else if (shift) {
            currentLink = new TemporaryLink(mouse, mouse);
        }

        this.draw();

        if (canvasHasFocus()) {
            // disable drag-and-drop only if the canvas is already focused
            return false;
        } else {
            // otherwise, let the browser switch the focus away from wherever it was
            this.resetCaret();
            return true;
        }
    };

    this.canvas.ondblclick = (e) => {
        var mouse = this.crossBrowserRelativeMousePos(e);
        selectedObject = this.selectObject(mouse.x, mouse.y);

        if (selectedObject == null) {
            selectedObject = new Node(mouse.x, mouse.y);
            nodes.push(selectedObject);
            this.resetCaret();
            this.draw();
        } else if (selectedObject instanceof Node) {
            selectedObject.isAcceptState = !selectedObject.isAcceptState;
            this.draw();
        }
    };

    this.canvas.onmousemove = (e) => {
        var mouse = this.crossBrowserRelativeMousePos(e);

        if (currentLink != null) {
            if (currentLink instanceof Link && shift == false) {
                currentLink.setAnchorPoint(mouse.x, mouse.y)
            } else {
                var targetNode = this.selectObject(mouse.x, mouse.y);
                if (!(targetNode instanceof Node)) {
                    targetNode = null;
                }

                if (selectedObject == null) {
                    if (targetNode != null) {
                        currentLink = new StartLink(targetNode, originalClick);
                    } else {
                        currentLink = new TemporaryLink(originalClick, mouse);
                    }
                } else {
                    if (targetNode == selectedObject) {
                        currentLink = new SelfLink(selectedObject, mouse);
                    } else if (targetNode != null) {
                        currentLink = new Link(selectedObject, targetNode);
                    } else {
                        currentLink = new TemporaryLink(selectedObject.closestPointOnCircle(mouse.x, mouse.y), mouse);
                    }
                }
            }

            this.draw();
        }

        if (movingObject) {
            selectedObject.setAnchorPoint(mouse.x, mouse.y);
            if (selectedObject instanceof Node) {
                this.snapNode(selectedObject);
            }
            this.draw();
        }
    };

    this.canvas.onmouseup = (e) => {
        movingObject = false;

        if (currentLink != null) {
            if (!(currentLink instanceof TemporaryLink)) {
                selectedObject = currentLink;
                links.push(currentLink);
                this.resetCaret();
            }
            currentLink = null;
            this.draw();
        }

    };

    this.canvas.oncontextmenu = (e) => {
        deleteSelectedObject()
        return false;
    }

    $('#' + answersName + '-clear-fsm').on('click', () => {
        if (window.confirm('Are you sure you want to clear your ' + fsmTypeName + '?')) {
            nodes = [];
            links = [];
            this.draw();
        }
    });

    $('#' + answersName + '-toggle-state-size').on('click', () => {
        if (nodeRadius == smallStateSize) {
            nodeRadius = largeStateSize;
        }
        else {
            nodeRadius = smallStateSize;
        }
        this.draw();
    });


document.onkeydown = (e) => {
    var key = crossBrowserKey(e);

    if (key == 16) {
        shift = true;
    } else if (!canvasHasFocus()) {
        // don't read keystrokes when other things have focus
        return true;
    } else if (key == 8) { // backspace key
        if (selectedObject != null && 'text' in selectedObject) {
            // Reset highlighting when user backspaces
            stateNamesToHighlight = transitionsToHighlight = null;

            selectedObject.text = selectedObject.text.substr(0, selectedObject.text.length - 1);
            this.resetCaret();
            this.draw();
        }

        // backspace is a shortcut for the back button, but do NOT want to change pages
        return false;
    } else if (key == 46) { // delete key
        this.deleteSelectedObject()
    }
};

document.onkeyup = function (e) {
    var key = crossBrowserKey(e);

    if (key == 16) {
        shift = false;
    }
};

document.onkeypress = (e) => {
    // don't read keystrokes when other things have focus
    var key = crossBrowserKey(e);
    var keyBounds = false;

    if (selectedObject instanceof Node) {
        keyBounds = (key >= 0x20 && key <= 0x7E)
    } else {
        // For transitions. Set keyBounds to true if any
        // key in the alphabet is pressed or if key is a comma (0x2C)
        keyBounds = alphabetList.includes(String.fromCharCode(key)) || key == 0x2C
    }
    if (!canvasHasFocus()) {
        // don't read keystrokes when other things have focus
        return true;

    } else if (keyBounds && !e.metaKey && !e.altKey && !e.ctrlKey && selectedObject != null && 'text' in selectedObject) {
        // Reset highlighting when user types
        stateNamesToHighlight = transitionsToHighlight = null;

        selectedObject.text += String.fromCharCode(key);
        this.resetCaret();
        this.draw();

        // don't let keys do their actions (like space scrolls down the page)
        return false;
    } else if (key == 8) {
        // backspace is a shortcut for the back button, but do NOT want to change pages
        return false;
    }
};
}
// Drawing Code

draw() {
  this.drawUsing(this.canvas.getContext('2d'));
  this.saveBackup();
}

drawUsing(c) {
    var dump_state = (checkbox ? checkbox.checked : false);
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.save();
    c.translate(0.5, 0.5);

    if (state_limit && (nodes.length+(dump_state ? 1 : 0)) > state_limit){
        c.fillStyle = c.strokeStyle = 'darkorchid'
        c.font = '20px "Roboto", sans-serif';
        c.fillText('Warning: Too many states', 10, this.canvas.height-10)
        c.fillStyle = c.strokeStyle = 'black'
    }

    for (var i = 0; i < nodes.length; i++) {
        c.lineWidth = 1;

        var color = 'black';

        if (stateNamesToHighlight != null) {
          for (var j = 0; j < stateNamesToHighlight.length; j++) {
            if (stateNamesToHighlight[j].name == nodes[i].text){
              color = 'red';
            }
          }
        }


        if (nodes[i] == selectedObject) {
          color = 'blue'
        }

        c.fillStyle = c.strokeStyle = color

        nodes[i].draw(c);
    }
    for (var i = 0; i < links.length; i++) {
        c.lineWidth = 1;

        var color = 'black';

        if (transitionsToHighlight != null) {
          for (var j = 0; j < transitionsToHighlight.length; j++) {
            // Check if should highlight self-transitions
            if (links[i] instanceof SelfLink) {
              if (links[i].node.text == transitionsToHighlight[j].startState
                  && links[i].text.includes(transitionsToHighlight[j].char)
                  && links[i].node.text == transitionsToHighlight[j].endState) {

                color = 'red';
              }
            }

            // Otherwise, check if should highlight normal transitions
            else if (links[i] instanceof Link) {
              if (links[i].nodeA.text == transitionsToHighlight[j].startState
                  && links[i].text.includes(transitionsToHighlight[j].char)
                  && links[i].nodeB.text == transitionsToHighlight[j].endState) {

                color = 'red';
              }
            }

            else if (links[i] instanceof StartLink) {
              if (null == transitionsToHighlight[j].startState
                  && null == transitionsToHighlight[j].char
                  && links[i].node.text == transitionsToHighlight[j].endState) {

                color = 'red';
              }
            }
          }
        }

        if (links[i] == selectedObject) {
          color = 'blue';
        }

        c.fillStyle = c.strokeStyle = color;
        links[i].draw(c);
    }
    if (currentLink != null) {
        c.lineWidth = 1;
        c.fillStyle = c.strokeStyle = 'black';
        currentLink.draw(c);
    }

    c.restore();
}

selectObject(x, y) {
    for (var i = 0; i < nodes.length; i++) {
        if (nodes[i].containsPoint(x, y)) {
            return nodes[i];
        }
    }
    for (var i = 0; i < links.length; i++) {
        if (links[i].containsPoint(x, y)) {
            return links[i];
        }
    }
    return null;
}

snapNode(node) {
    for (var i = 0; i < nodes.length; i++) {
        if (nodes[i] == node) continue;

        if (Math.abs(node.x - nodes[i].x) < snapToPadding) {
            node.x = nodes[i].x;
        }

        if (Math.abs(node.y - nodes[i].y) < snapToPadding) {
            node.y = nodes[i].y;
        }
    }
}



resetCaret() {
    clearInterval(caretTimer);
    caretTimer = setInterval(() => {
      caretVisible = !caretVisible;
      this.draw();
    }, 500);
    caretVisible = true;
}


// M&KB Input

crossBrowserRelativeMousePos(e) {
    var element = this.crossBrowserElementPos(e);
    var mouse = this.crossBrowserMousePos(e);
    return {
        'x': mouse.x - element.x,
        'y': mouse.y - element.y
    };
}

crossBrowserMousePos(e) {
    e = e || window.event;
    return {
        'x': e.pageX || e.clientX + document.body.scrollLeft + document.documentElement.scrollLeft,
        'y': e.pageY || e.clientY + document.body.scrollTop + document.documentElement.scrollTop,
    };
}

crossBrowserElementPos(e) {
    e = e || window.event;
    var obj = e.target || e.srcElement;
    var x = 0, y = 0;
    while (obj.offsetParent) {
        x += obj.offsetLeft;
        y += obj.offsetTop;
        obj = obj.offsetParent;
    }
    return { 'x': x, 'y': y };
}


restoreBackup(backupJson) {
    if (!backupJson || !JSON) {
        return;
    }

    try {
        var backup = JSON.parse(backupJson);

        nodeRadius = backup.nodeRadius;

        for (var i = 0; i < backup.nodes.length; i++) {
            var backupNode = backup.nodes[i];
            var node = new Node(backupNode.x, backupNode.y);
            node.isAcceptState = backupNode.isAcceptState;
            node.text = backupNode.text;
            nodes.push(node);
        }
        for (var i = 0; i < backup.links.length; i++) {
            var backupLink = backup.links[i];
            var link = null;
            if (backupLink.type == 'SelfLink') {
                link = new SelfLink(nodes[backupLink.node]);
                link.anchorAngle = backupLink.anchorAngle;
                link.text = backupLink.text;
            } else if (backupLink.type == 'StartLink') {
                link = new StartLink(nodes[backupLink.node]);
                link.deltaX = backupLink.deltaX;
                link.deltaY = backupLink.deltaY;
                link.text = backupLink.text;
            } else if (backupLink.type == 'Link') {
                link = new Link(nodes[backupLink.nodeA], nodes[backupLink.nodeB]);
                link.parallelPart = backupLink.parallelPart;
                link.perpendicularPart = backupLink.perpendicularPart;
                link.text = backupLink.text;
                link.lineAngleAdjust = backupLink.lineAngleAdjust;
            }
            if (link != null) {
                links.push(link);
            }
        }
    } catch (e) {

    }
}

saveBackup() {
    if (!JSON) {
        return;
    }

    var backup = {
        'nodes': [],
        'links': [],
        'nodeRadius': nodeRadius
    };
    for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        var backupNode = {
            'x': node.x,
            'y': node.y,
            'text': node.text,
            'isAcceptState': node.isAcceptState,
        };
        backup.nodes.push(backupNode);
    }
    for (var i = 0; i < links.length; i++) {
        var link = links[i];
        var backupLink = null;
        if (link instanceof SelfLink) {
            backupLink = {
                'type': 'SelfLink',
                'node': nodes.indexOf(link.node),
                'text': link.text,
                'anchorAngle': link.anchorAngle,
            };
        } else if (link instanceof StartLink) {
            backupLink = {
                'type': 'StartLink',
                'node': nodes.indexOf(link.node),
                'text': link.text,
                'deltaX': link.deltaX,
                'deltaY': link.deltaY,
            };
        } else if (link instanceof Link) {
            backupLink = {
                'type': 'Link',
                'nodeA': nodes.indexOf(link.nodeA),
                'nodeB': nodes.indexOf(link.nodeB),
                'text': link.text,
                'lineAngleAdjust': link.lineAngleAdjust,
                'parallelPart': link.parallelPart,
                'perpendicularPart': link.perpendicularPart,
            };
        }
        if (backupLink != null) {
            backup.links.push(backupLink);
        }
    }
    $('input#' + answersName + '-raw-json').val(JSON.stringify(backup));
}

setFormatErrors(formatErrorsJson) {
    if (!formatErrorsJson || !JSON) {
        return;
    }

    try {
        formatErrors = JSON.parse(formatErrorsJson);

        if (formatErrors.stateNames != null) {
          stateNamesToHighlight = formatErrors.stateNames;
        }

        if (formatErrors.transitions != null) {
          transitionsToHighlight = formatErrors.transitions;
        }
    } catch (e) {

    }
}

deleteSelectedObject() {
    if (selectedObject != null) {
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i] == selectedObject) {
                nodes.splice(i--, 1);
            }
        }
        for (var i = 0; i < links.length; i++) {
            if (links[i] == selectedObject || links[i].node == selectedObject || links[i].nodeA == selectedObject || links[i].nodeB == selectedObject) {
                links.splice(i--, 1);
            }
        }

        // Reset highlighting when user deletes something
        stateNamesToHighlight = transitionsToHighlight = null;

        selectedObject = null;
        this.draw();
    }
}
}

function drawText(c, originalText, x, y, angleOrNull, isSelected) {
  text = originalText
  //text = convertLatexShortcuts(originalText);
  c.font = '20px "Times New Roman", serif';
  var width = c.measureText(text).width;

  // Attempt to keep text within the bounds of the node
  if (width > nodeRadius + 16) {
      var newpx = 20 - parseInt((width - nodeRadius) / 8);
      if (newpx < 10) newpx = 10;
      c.font = newpx + 'px "Times New Roman", serif';
      width = c.measureText(text).width;
  }

  // center the text
  x -= width / 2;

  // position the text intelligently if given an angle
  if (angleOrNull != null) {
      var cos = Math.cos(angleOrNull);
      var sin = Math.sin(angleOrNull);
      var cornerPointX = (width / 2 + 5) * (cos > 0 ? 1 : -1);
      var cornerPointY = (10 + 5) * (sin > 0 ? 1 : -1);
      var slide = sin * Math.pow(Math.abs(sin), 40) * cornerPointX - cos * Math.pow(Math.abs(cos), 10) * cornerPointY;
      x += cornerPointX - sin * slide;
      y += cornerPointY + cos * slide;
  }

  // draw text and caret (round the coordinates so the caret falls on a pixel)
  if ('advancedFillText' in c) {
      c.advancedFillText(text, originalText, x + width / 2, y, angleOrNull);
  } else {
      x = Math.round(x);
      y = Math.round(y);
      c.fillText(text, x, y + 6);
      if (isSelected && caretVisible && canvasHasFocus() && document.hasFocus()) {
          x += width;
          c.beginPath();
          c.moveTo(x, y - 10);
          c.lineTo(x, y + 10);
          c.stroke();
      }
  }
}

function canvasHasFocus() {
  return (document.activeElement || document.body) == document.body;
}


function drawArrow(c, x, y, angle) {
  var dx = Math.cos(angle);
  var dy = Math.sin(angle);
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(x - 8 * dx + 5 * dy, y - 8 * dy - 5 * dx);
  c.lineTo(x - 8 * dx - 5 * dy, y - 8 * dy + 5 * dx);
  c.fill();
}

function crossBrowserKey(e) {
  e = e || window.event;
  return e.which || e.keyCode;
}
