
const FSMBuilder = (function () {

  const snapToPadding = 6; // pixels
  const hitTargetPadding = 6; // pixels
  const smallStateSize = 25; // pixels
  const largeStateSize = 40; // pixels

  class FSMBuilder {

    constructor(name, options) {
      this.answersName = name;
      this.fsmTypeName = options.fsmType;
      this.alphabetList = options.alphabet;

      this.nodes = [];
      this.links = [];

      this.stateNamesToHighlight = null;
      this.transitionsToHighlight = null;

      this.currentLink = null;
      this.selectedObject = null;
      this.movingObject = false;
      this.shift = false;
      this.caretVisible = true;
      this.nodeRadius = largeStateSize;

      this.canvas = document.getElementById(this.answersName + '-fsm-canvas');

      this.state_limit = options.max_states;
      this.checkbox = document.getElementById(this.answersName + '-include-dump-state')

      this.restoreBackup(options.backupJson);
      this.setFormatErrors(options.formatErrorsJson);
      this.draw();

      // If not editable, we don't allow the user to modify anything, so just exit
      if (!options.editable) {
        return;
      }


      this.canvas.onmousedown = (e) => {
        var mouse = this.crossBrowserRelativeMousePos(e);
        this.selectedObject = this.selectObject(mouse.x, mouse.y);
        this.movingObject = false;
        this.originalClick = mouse;

        if (this.selectedObject != null) {
          if (this.shift && this.selectedObject instanceof Node) {
            this.currentLink = new SelfLink(this.selectedObject, mouse);
          } else {
            this.movingObject = true;

            if (this.selectedObject.setMouseStart) {
              this.selectedObject.setMouseStart(mouse.x, mouse.y);
            }
          }
          this.resetCaret();
        } else if (this.shift) {
          this.currentLink = new TemporaryLink(mouse, mouse);
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
        this.selectedObject = this.selectObject(mouse.x, mouse.y);

        if (this.selectedObject == null) {
          this.selectedObject = new Node(mouse.x, mouse.y);
          this.nodes.push(this.selectedObject);
          this.resetCaret();
          this.draw();
        } else if (this.selectedObject instanceof Node) {
          this.selectedObject.isAcceptState = !this.selectedObject.isAcceptState;
          this.draw();
        }
      };

      this.canvas.onmousemove = (e) => {
        var mouse = this.crossBrowserRelativeMousePos(e);

        if (this.currentLink != null) {
          if (this.currentLink instanceof Link && this.shift == false) {
            this.currentLink.setAnchorPoint(mouse.x, mouse.y)
          } else {
            var targetNode = this.selectObject(mouse.x, mouse.y);
            if (!(targetNode instanceof Node)) {
              targetNode = null;
            }

            if (this.selectedObject == null) {
              if (targetNode != null) {
                this.currentLink = new StartLink(targetNode, this.originalClick);
              } else {
                this.currentLink = new TemporaryLink(this.originalClick, mouse);
              }
            } else {
              if (targetNode == this.selectedObject) {
                this.currentLink = new SelfLink(this.selectedObject, mouse);
              } else if (targetNode != null) {
                this.currentLink = new Link(this.selectedObject, targetNode);
              } else {
                this.currentLink = new TemporaryLink(this.selectedObject.closestPointOnCircle(mouse.x, mouse.y, this.nodeRadius), mouse);
              }
            }
          }

          this.draw();
        }

        //TODO This might need a null check?
        if (this.movingObject) {
          this.selectedObject.setAnchorPoint(mouse.x, mouse.y);
          if (this.selectedObject instanceof Node) {
            this.snapNode(this.selectedObject);
          }
          this.draw();
        }
      };

      this.canvas.onmouseup = (e) => {
        this.movingObject = false;

        if (this.currentLink != null) {
          if (!(this.currentLink instanceof TemporaryLink)) {
            this.selectedObject = this.currentLink;
            this.links.push(this.currentLink);
            this.resetCaret();
          }
          this.currentLink = null;
          this.draw();
        }

      };

      this.canvas.oncontextmenu = (e) => {
        this.deleteSelectedObject()
        return false;
      }

      $('#' + this.answersName + '-clear-fsm').on('click', () => {
        if (window.confirm('Are you sure you want to clear your ' + this.fsmTypeName + '?')) {
          this.nodes = [];
          this.links = [];
          this.draw();
        }
      });

      $('#' + this.answersName + '-toggle-state-size').on('click', () => {
        if (this.nodeRadius == smallStateSize) {
          this.nodeRadius = largeStateSize;
        }
        else {
          this.nodeRadius = smallStateSize;
        }
        this.draw();
      });


      document.onkeydown = (e) => {
        var key = crossBrowserKey(e);

        if (key == 16) {
          this.shift = true;
        } else if (!canvasHasFocus()) {
          // don't read keystrokes when other things have focus
          return true;
        } else if (key == 8) { // backspace key
          if (this.selectedObject != null && 'text' in this.selectedObject) {
            // Reset highlighting when user backspaces
            this.stateNamesToHighlight = this.transitionsToHighlight = null;

            this.selectedObject.text = this.selectedObject.text.substr(0, this.selectedObject.text.length - 1);
            this.resetCaret();
            this.draw();
          }

          // backspace is a shortcut for the back button, but do NOT want to change pages
          return false;
        } else if (key == 46) { // delete key
          this.deleteSelectedObject()
        }
      };

      document.onkeyup = (e) => {
        var key = crossBrowserKey(e);

        if (key == 16) {
          this.shift = false;
        }
      };

      document.onkeypress = (e) => {
        // don't read keystrokes when other things have focus
        var key = crossBrowserKey(e);
        var keyBounds = false;

        if (this.selectedObject instanceof Node) {
          keyBounds = (key >= 0x20 && key <= 0x7E)
        } else {
          // For transitions. Set keyBounds to true if any
          // key in the alphabet is pressed or if key is a comma (0x2C)
          keyBounds = this.alphabetList.includes(String.fromCharCode(key)) || key == 0x2C
        }
        if (!canvasHasFocus()) {
          // don't read keystrokes when other things have focus
          return true;

        } else if (keyBounds && !e.metaKey && !e.altKey && !e.ctrlKey && this.selectedObject != null && 'text' in this.selectedObject) {
          // Reset highlighting when user types
          this.stateNamesToHighlight = this.transitionsToHighlight = null;

          this.selectedObject.text += String.fromCharCode(key);
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
      var dump_state = (this.checkbox ? this.checkbox.checked : false);
      c.clearRect(0, 0, this.canvas.width, this.canvas.height);
      c.save();
      c.translate(0.5, 0.5);

      if (this.state_limit > 0 && (this.nodes.length + (dump_state ? 1 : 0)) > this.state_limit) {
        c.fillStyle = c.strokeStyle = 'darkorchid'
        c.font = '20px "Roboto", sans-serif';
        c.fillText('Warning: Too many states', 10, this.canvas.height - 10)
        c.fillStyle = c.strokeStyle = 'black'
      }

      for (var i = 0; i < this.nodes.length; i++) {
        c.lineWidth = 1;

        var color = 'black';
        var isSelected = false;

        if (this.stateNamesToHighlight != null) {
          for (var j = 0; j < this.stateNamesToHighlight.length; j++) {
            if (this.stateNamesToHighlight[j].name == this.nodes[i].text) {
              color = 'red';
            }
          }
        }


        if (this.nodes[i] == this.selectedObject) {
          color = 'blue';
          isSelected = true;
        }

        c.fillStyle = c.strokeStyle = color

        this.nodes[i].draw(c, isSelected, this.nodeRadius, this.caretVisible);
      }
      for (var i = 0; i < this.links.length; i++) {
        c.lineWidth = 1;

        var color = 'black';
        var isSelected = false;

        if (this.transitionsToHighlight != null) {
          for (var j = 0; j < this.transitionsToHighlight.length; j++) {
            // Check if should highlight self-transitions
            if (this.links[i] instanceof SelfLink) {
              if (this.links[i].node.text == this.transitionsToHighlight[j].startState
                && this.links[i].text.includes(this.transitionsToHighlight[j].char)
                && this.links[i].node.text == this.transitionsToHighlight[j].endState) {

                color = 'red';
              }
            }

            // Otherwise, check if should highlight normal transitions
            else if (this.links[i] instanceof Link) {
              if (this.links[i].nodeA.text == this.transitionsToHighlight[j].startState
                && this.links[i].text.includes(this.transitionsToHighlight[j].char)
                && this.links[i].nodeB.text == this.transitionsToHighlight[j].endState) {

                color = 'red';
              }
            }

            else if (this.links[i] instanceof StartLink) {
              if (null == this.transitionsToHighlight[j].startState
                && null == this.transitionsToHighlight[j].char
                && this.links[i].node.text == this.transitionsToHighlight[j].endState) {

                color = 'red';
              }
            }
          }
        }

        if (this.links[i] == this.selectedObject) {
          color = 'blue';
          isSelected = true;
        }

        c.fillStyle = c.strokeStyle = color;
        this.links[i].draw(c, isSelected, this.nodeRadius, this.caretVisible);
      }
      if (this.currentLink != null) {
        c.lineWidth = 1;
        c.fillStyle = c.strokeStyle = 'black';
        this.currentLink.draw(c, isSelected, this.nodeRadius, this.caretVisible);
      }

      c.restore();
    }

    selectObject(x, y) {
      for (var i = 0; i < this.nodes.length; i++) {
        if (this.nodes[i].containsPoint(x, y, this.nodeRadius)) {
          return this.nodes[i];
        }
      }
      for (var i = 0; i < this.links.length; i++) {
        if (this.links[i].containsPoint(x, y, this.nodeRadius)) {
          return this.links[i];
        }
      }
      return null;
    }

    snapNode(node) {
      for (var i = 0; i < this.nodes.length; i++) {
        if (this.nodes[i] == node) continue;

        if (Math.abs(node.x - this.nodes[i].x) < snapToPadding) {
          node.x = this.nodes[i].x;
        }

        if (Math.abs(node.y - this.nodes[i].y) < snapToPadding) {
          node.y = this.nodes[i].y;
        }
      }
    }



    resetCaret() {
      clearInterval(this.caretTimer);
      this.caretTimer = setInterval(() => {
        this.caretVisible = !this.caretVisible;
        this.draw();
      }, 500);
      this.caretVisible = true;
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

        this.nodeRadius = backup.nodeRadius;

        for (var i = 0; i < backup.nodes.length; i++) {
          var backupNode = backup.nodes[i];
          var node = new Node(backupNode.x, backupNode.y);
          node.isAcceptState = backupNode.isAcceptState;
          node.text = backupNode.text;
          this.nodes.push(node);
        }
        for (var i = 0; i < backup.links.length; i++) {
          var backupLink = backup.links[i];
          var link = null;
          if (backupLink.type == 'SelfLink') {
            link = new SelfLink(this.nodes[backupLink.node]);
            link.anchorAngle = backupLink.anchorAngle;
            link.text = backupLink.text;
          } else if (backupLink.type == 'StartLink') {
            link = new StartLink(this.nodes[backupLink.node]);
            link.deltaX = backupLink.deltaX;
            link.deltaY = backupLink.deltaY;
            link.text = backupLink.text;
          } else if (backupLink.type == 'Link') {
            link = new Link(this.nodes[backupLink.nodeA], this.nodes[backupLink.nodeB]);
            link.parallelPart = backupLink.parallelPart;
            link.perpendicularPart = backupLink.perpendicularPart;
            link.text = backupLink.text;
            link.lineAngleAdjust = backupLink.lineAngleAdjust;
          }
          if (link != null) {
            this.links.push(link);
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
        'nodeRadius': this.nodeRadius
      };
      for (var i = 0; i < this.nodes.length; i++) {
        var node = this.nodes[i];
        var backupNode = {
          'x': node.x,
          'y': node.y,
          'text': node.text,
          'isAcceptState': node.isAcceptState,
        };
        backup.nodes.push(backupNode);
      }
      for (var i = 0; i < this.links.length; i++) {
        var link = this.links[i];
        var backupLink = null;
        if (link instanceof SelfLink) {
          backupLink = {
            'type': 'SelfLink',
            'node': this.nodes.indexOf(link.node),
            'text': link.text,
            'anchorAngle': link.anchorAngle,
          };
        } else if (link instanceof StartLink) {
          backupLink = {
            'type': 'StartLink',
            'node': this.nodes.indexOf(link.node),
            'text': link.text,
            'deltaX': link.deltaX,
            'deltaY': link.deltaY,
          };
        } else if (link instanceof Link) {
          backupLink = {
            'type': 'Link',
            'nodeA': this.nodes.indexOf(link.nodeA),
            'nodeB': this.nodes.indexOf(link.nodeB),
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
      $('input#' + this.answersName + '-raw-json').val(JSON.stringify(backup));
    }

    setFormatErrors(formatErrorsJson) {
      if (!formatErrorsJson || !JSON) {
        return;
      }

      try {
        var formatErrors = JSON.parse(formatErrorsJson);

        if (formatErrors.stateNames != null) {
          this.stateNamesToHighlight = formatErrors.stateNames;
        }

        if (formatErrors.transitions != null) {
          this.transitionsToHighlight = formatErrors.transitions;
        }
      } catch (e) {

      }
    }

    deleteSelectedObject() {
      if (this.selectedObject != null) {
        for (var i = 0; i < this.nodes.length; i++) {
          if (this.nodes[i] == this.selectedObject) {
            this.nodes.splice(i--, 1);
          }
        }
        for (var i = 0; i < this.links.length; i++) {
          if (this.links[i] == this.selectedObject
            || this.links[i].node == this.selectedObject
            || this.links[i].nodeA == this.selectedObject
            || this.links[i].nodeB == this.selectedObject) {
            this.links.splice(i--, 1);
          }
        }

        // Reset highlighting when user deletes something
        this.stateNamesToHighlight = this.transitionsToHighlight = null;

        this.selectedObject = null;
        this.draw();
      }
    }
  }

  function drawText(c, originalText, x, y, angleOrNull, isSelected, nodeRadius, caretVisible) {
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


  // Node class
  function Node(x, y) {
    this.x = x;
    this.y = y;
    this.mouseOffsetX = 0;
    this.mouseOffsetY = 0;
    this.isAcceptState = false;
    this.text = '';
  }

  Node.prototype.setMouseStart = function (x, y) {
    this.mouseOffsetX = this.x - x;
    this.mouseOffsetY = this.y - y;
  };

  Node.prototype.setAnchorPoint = function (x, y) {
    this.x = x + this.mouseOffsetX;
    this.y = y + this.mouseOffsetY;
  };

  Node.prototype.draw = function (c, isSelected, nodeRadius, caretVisible) {
    // draw the circle
    c.beginPath();
    c.arc(this.x, this.y, nodeRadius, 0, 2 * Math.PI, false);
    c.stroke();

    // draw the text
    drawText(c, this.text, this.x, this.y, null, isSelected, nodeRadius, caretVisible);

    // draw a double circle for an accept state
    if (this.isAcceptState) {
      c.beginPath();
      c.arc(this.x, this.y, nodeRadius - 6, 0, 2 * Math.PI, false);
      c.stroke();
    }
  };

  Node.prototype.closestPointOnCircle = function (x, y, nodeRadius) {
    var dx = x - this.x;
    var dy = y - this.y;
    var scale = Math.sqrt(dx * dx + dy * dy);
    return {
      'x': this.x + dx * nodeRadius / scale,
      'y': this.y + dy * nodeRadius / scale,
    };
  };

  Node.prototype.containsPoint = function (x, y, nodeRadius) {
    return (x - this.x) * (x - this.x) + (y - this.y) * (y - this.y) < nodeRadius * nodeRadius;
  };


  // Helper Math Functions
  function det(a, b, c, d, e, f, g, h, i) {
    return a * e * i + b * f * g + c * d * h - a * f * h - b * d * i - c * e * g;
  }

  function circleFromThreePoints(x1, y1, x2, y2, x3, y3) {
    var a = det(x1, y1, 1, x2, y2, 1, x3, y3, 1);
    var bx = -det(x1 * x1 + y1 * y1, y1, 1, x2 * x2 + y2 * y2, y2, 1, x3 * x3 + y3 * y3, y3, 1);
    var by = det(x1 * x1 + y1 * y1, x1, 1, x2 * x2 + y2 * y2, x2, 1, x3 * x3 + y3 * y3, x3, 1);
    var c = -det(x1 * x1 + y1 * y1, x1, y1, x2 * x2 + y2 * y2, x2, y2, x3 * x3 + y3 * y3, x3, y3);
    return {
      'x': -bx / (2 * a),
      'y': -by / (2 * a),
      'radius': Math.sqrt(bx * bx + by * by - 4 * a * c) / (2 * Math.abs(a))
    };
  }

  // Standard Links

  function Link(a, b) {
    this.nodeA = a;
    this.nodeB = b;
    this.text = '';
    this.lineAngleAdjust = 0; // value to add to textAngle when link is straight line

    // make anchor point relative to the locations of nodeA and nodeB
    this.parallelPart = 0.5; // percentage from nodeA to nodeB
    this.perpendicularPart = 0; // pixels from line between nodeA and nodeB
  }

  Link.prototype.getAnchorPoint = function () {
    var dx = this.nodeB.x - this.nodeA.x;
    var dy = this.nodeB.y - this.nodeA.y;
    var scale = Math.sqrt(dx * dx + dy * dy);
    return {
      'x': this.nodeA.x + dx * this.parallelPart - dy * this.perpendicularPart / scale,
      'y': this.nodeA.y + dy * this.parallelPart + dx * this.perpendicularPart / scale
    };
  };

  Link.prototype.setAnchorPoint = function (x, y) {
    var dx = this.nodeB.x - this.nodeA.x;
    var dy = this.nodeB.y - this.nodeA.y;
    var scale = Math.sqrt(dx * dx + dy * dy);
    this.parallelPart = (dx * (x - this.nodeA.x) + dy * (y - this.nodeA.y)) / (scale * scale);
    this.perpendicularPart = (dx * (y - this.nodeA.y) - dy * (x - this.nodeA.x)) / scale;
    // snap to a straight line
    if (this.parallelPart > 0 && this.parallelPart < 1 && Math.abs(this.perpendicularPart) < snapToPadding) {
      this.lineAngleAdjust = (this.perpendicularPart < 0) * Math.PI;
      this.perpendicularPart = 0;
    }
  };

  Link.prototype.getEndPointsAndCircle = function (nodeRadius) {
    if (this.perpendicularPart == 0) {
      var midX = (this.nodeA.x + this.nodeB.x) / 2;
      var midY = (this.nodeA.y + this.nodeB.y) / 2;
      var start = this.nodeA.closestPointOnCircle(midX, midY, nodeRadius);
      var end = this.nodeB.closestPointOnCircle(midX, midY, nodeRadius);
      return {
        'hasCircle': false,
        'startX': start.x,
        'startY': start.y,
        'endX': end.x,
        'endY': end.y,
      };
    }
    var anchor = this.getAnchorPoint();
    var circle = circleFromThreePoints(this.nodeA.x, this.nodeA.y, this.nodeB.x, this.nodeB.y, anchor.x, anchor.y);
    var isReversed = (this.perpendicularPart > 0);
    var reverseScale = isReversed ? 1 : -1;
    var startAngle = Math.atan2(this.nodeA.y - circle.y, this.nodeA.x - circle.x) - reverseScale * nodeRadius / circle.radius;
    var endAngle = Math.atan2(this.nodeB.y - circle.y, this.nodeB.x - circle.x) + reverseScale * nodeRadius / circle.radius;
    var startX = circle.x + circle.radius * Math.cos(startAngle);
    var startY = circle.y + circle.radius * Math.sin(startAngle);
    var endX = circle.x + circle.radius * Math.cos(endAngle);
    var endY = circle.y + circle.radius * Math.sin(endAngle);
    return {
      'hasCircle': true,
      'startX': startX,
      'startY': startY,
      'endX': endX,
      'endY': endY,
      'startAngle': startAngle,
      'endAngle': endAngle,
      'circleX': circle.x,
      'circleY': circle.y,
      'circleRadius': circle.radius,
      'reverseScale': reverseScale,
      'isReversed': isReversed,
    };
  };

  Link.prototype.draw = function (c, isSelected, nodeRadius, caretVisible) {
    var stuff = this.getEndPointsAndCircle(nodeRadius);
    // draw arc
    c.beginPath();
    if (stuff.hasCircle) {
      c.arc(stuff.circleX, stuff.circleY, stuff.circleRadius, stuff.startAngle, stuff.endAngle, stuff.isReversed);
    } else {
      c.moveTo(stuff.startX, stuff.startY);
      c.lineTo(stuff.endX, stuff.endY);
    }
    c.stroke();
    // draw the head of the arrow
    if (stuff.hasCircle) {
      drawArrow(c, stuff.endX, stuff.endY, stuff.endAngle - stuff.reverseScale * (Math.PI / 2));
    } else {
      drawArrow(c, stuff.endX, stuff.endY, Math.atan2(stuff.endY - stuff.startY, stuff.endX - stuff.startX));
    }
    // draw the text
    if (stuff.hasCircle) {
      var startAngle = stuff.startAngle;
      var endAngle = stuff.endAngle;
      if (endAngle < startAngle) {
        endAngle += Math.PI * 2;
      }
      var textAngle = (startAngle + endAngle) / 2 + stuff.isReversed * Math.PI;
      var textX = stuff.circleX + stuff.circleRadius * Math.cos(textAngle);
      var textY = stuff.circleY + stuff.circleRadius * Math.sin(textAngle);
      drawText(c, this.text, textX, textY, textAngle, isSelected, nodeRadius, caretVisible);
    } else {
      var textX = (stuff.startX + stuff.endX) / 2;
      var textY = (stuff.startY + stuff.endY) / 2;
      var textAngle = Math.atan2(stuff.endX - stuff.startX, stuff.startY - stuff.endY);
      drawText(c, this.text, textX, textY, textAngle + this.lineAngleAdjust, isSelected, nodeRadius, caretVisible);
    }
  };

  Link.prototype.containsPoint = function (x, y, nodeRadius) {
    var stuff = this.getEndPointsAndCircle(nodeRadius);
    if (stuff.hasCircle) {
      var dx = x - stuff.circleX;
      var dy = y - stuff.circleY;
      var distance = Math.sqrt(dx * dx + dy * dy) - stuff.circleRadius;
      if (Math.abs(distance) < hitTargetPadding) {
        var angle = Math.atan2(dy, dx);
        var startAngle = stuff.startAngle;
        var endAngle = stuff.endAngle;
        if (stuff.isReversed) {
          var temp = startAngle;
          startAngle = endAngle;
          endAngle = temp;
        }
        if (endAngle < startAngle) {
          endAngle += Math.PI * 2;
        }
        if (angle < startAngle) {
          angle += Math.PI * 2;
        } else if (angle > endAngle) {
          angle -= Math.PI * 2;
        }
        return (angle > startAngle && angle < endAngle);
      }
    } else {
      var dx = stuff.endX - stuff.startX;
      var dy = stuff.endY - stuff.startY;
      var length = Math.sqrt(dx * dx + dy * dy);
      var percent = (dx * (x - stuff.startX) + dy * (y - stuff.startY)) / (length * length);
      var distance = (dx * (y - stuff.startY) - dy * (x - stuff.startX)) / length;
      return (percent > 0 && percent < 1 && Math.abs(distance) < hitTargetPadding);
    }
    return false;
  };

  // Self Links

  function SelfLink(node, mouse) {
    this.node = node;
    this.anchorAngle = 0;
    this.mouseOffsetAngle = 0;
    this.text = '';

    if (mouse) {
      this.setAnchorPoint(mouse.x, mouse.y);
    }
  }

  SelfLink.prototype.setMouseStart = function (x, y) {
    this.mouseOffsetAngle = this.anchorAngle - Math.atan2(y - this.node.y, x - this.node.x);
  };

  SelfLink.prototype.setAnchorPoint = function (x, y) {
    this.anchorAngle = Math.atan2(y - this.node.y, x - this.node.x) + this.mouseOffsetAngle;
    // snap to 90 degrees
    var snap = Math.round(this.anchorAngle / (Math.PI / 2)) * (Math.PI / 2);
    if (Math.abs(this.anchorAngle - snap) < 0.1) this.anchorAngle = snap;
    // keep in the range -pi to pi so our containsPoint() function always works
    if (this.anchorAngle < -Math.PI) this.anchorAngle += 2 * Math.PI;
    if (this.anchorAngle > Math.PI) this.anchorAngle -= 2 * Math.PI;
  };

  SelfLink.prototype.getEndPointsAndCircle = function (nodeRadius) {
    var circleX = this.node.x + 1.5 * nodeRadius * Math.cos(this.anchorAngle);
    var circleY = this.node.y + 1.5 * nodeRadius * Math.sin(this.anchorAngle);
    var circleRadius = 0.75 * nodeRadius;
    var startAngle = this.anchorAngle - Math.PI * 0.8;
    var endAngle = this.anchorAngle + Math.PI * 0.8;
    var startX = circleX + circleRadius * Math.cos(startAngle);
    var startY = circleY + circleRadius * Math.sin(startAngle);
    var endX = circleX + circleRadius * Math.cos(endAngle);
    var endY = circleY + circleRadius * Math.sin(endAngle);
    return {
      'hasCircle': true,
      'startX': startX,
      'startY': startY,
      'endX': endX,
      'endY': endY,
      'startAngle': startAngle,
      'endAngle': endAngle,
      'circleX': circleX,
      'circleY': circleY,
      'circleRadius': circleRadius
    };
  };

  SelfLink.prototype.draw = function (c, isSelected, nodeRadius, caretVisible) {
    var stuff = this.getEndPointsAndCircle(nodeRadius);
    // draw arc
    c.beginPath();
    c.arc(stuff.circleX, stuff.circleY, stuff.circleRadius, stuff.startAngle, stuff.endAngle, false);
    c.stroke();
    // draw the text on the loop farthest from the node
    var textX = stuff.circleX + stuff.circleRadius * Math.cos(this.anchorAngle);
    var textY = stuff.circleY + stuff.circleRadius * Math.sin(this.anchorAngle);
    drawText(c, this.text, textX, textY, this.anchorAngle, isSelected, nodeRadius, caretVisible);
    // draw the head of the arrow
    drawArrow(c, stuff.endX, stuff.endY, stuff.endAngle + Math.PI * 0.4);
  };

  SelfLink.prototype.containsPoint = function (x, y, nodeRadius) {
    var stuff = this.getEndPointsAndCircle(nodeRadius);
    var dx = x - stuff.circleX;
    var dy = y - stuff.circleY;
    var distance = Math.sqrt(dx * dx + dy * dy) - stuff.circleRadius;
    return (Math.abs(distance) < hitTargetPadding);
  };

  // Starting Link

  StartLink.prototype.setAnchorPoint = function (x, y) {
    this.deltaX = x - this.node.x;
    this.deltaY = y - this.node.y;

    if (Math.abs(this.deltaX) < snapToPadding) {
      this.deltaX = 0;
    }

    if (Math.abs(this.deltaY) < snapToPadding) {
      this.deltaY = 0;
    }
  };

  function StartLink(node, start) {
    this.node = node;
    this.deltaX = 0;
    this.deltaY = 0;

    if (start) {
      function circleFromThreePoints(x1, y1, x2, y2, x3, y3) {
        var a = det(x1, y1, 1, x2, y2, 1, x3, y3, 1);
        var bx = -det(x1 * x1 + y1 * y1, y1, 1, x2 * x2 + y2 * y2, y2, 1, x3 * x3 + y3 * y3, y3, 1);
        var by = det(x1 * x1 + y1 * y1, x1, 1, x2 * x2 + y2 * y2, x2, 1, x3 * x3 + y3 * y3, x3, 1);
        var c = -det(x1 * x1 + y1 * y1, x1, y1, x2 * x2 + y2 * y2, x2, y2, x3 * x3 + y3 * y3, x3, y3);
        return {
          'x': -bx / (2 * a),
          'y': -by / (2 * a),
          'radius': Math.sqrt(bx * bx + by * by - 4 * a * c) / (2 * Math.abs(a))
        };
      } this.setAnchorPoint(start.x, start.y);
    }
  }

  StartLink.prototype.getEndPoints = function (nodeRadius) {
    var startX = this.node.x + this.deltaX;
    var startY = this.node.y + this.deltaY;
    var end = this.node.closestPointOnCircle(startX, startY, nodeRadius);
    return {
      'startX': startX,
      'startY': startY,
      'endX': end.x,
      'endY': end.y,
    };
  };

  StartLink.prototype.draw = function (c, isSelected, nodeRadius, caretVisible) {
    var stuff = this.getEndPoints(nodeRadius);

    // draw the line
    c.beginPath();
    c.moveTo(stuff.startX, stuff.startY);
    c.lineTo(stuff.endX, stuff.endY);
    c.stroke();

    // draw the head of the arrow
    drawArrow(c, stuff.endX, stuff.endY, Math.atan2(-this.deltaY, -this.deltaX));
  };

  StartLink.prototype.containsPoint = function (x, y, nodeRadius) {
    var stuff = this.getEndPoints(nodeRadius);
    var dx = stuff.endX - stuff.startX;
    var dy = stuff.endY - stuff.startY;
    var length = Math.sqrt(dx * dx + dy * dy);
    var percent = (dx * (x - stuff.startX) + dy * (y - stuff.startY)) / (length * length);
    var distance = (dx * (y - stuff.startY) - dy * (x - stuff.startX)) / length;
    return (percent > 0 && percent < 1 && Math.abs(distance) < hitTargetPadding);
  };

  // Temporary Links

  function TemporaryLink(from, to) {
    this.from = from;
    this.to = to;
  }

  TemporaryLink.prototype.draw = function (c, isSelected, nodeRadius, caretVisible) {
    // draw the line
    c.beginPath();
    c.moveTo(this.to.x, this.to.y);
    c.lineTo(this.from.x, this.from.y);
    c.stroke();

    // draw the head of the arrow
    drawArrow(c, this.to.x, this.to.y, Math.atan2(this.to.y - this.from.y, this.to.x - this.from.x));
  };

  return FSMBuilder;

})();
