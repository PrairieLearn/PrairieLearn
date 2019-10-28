/* eslint-disable */

(function() {
    window.DrawingInterface = function(root_elem, elem_options, submitted_answer) {
        let canvas_elem = $(root_elem).find('canvas')[0];
        let canvas_width = canvas_elem.clientWidth;
        let canvas_height = canvas_elem.clientHeight;
        let html_input = $(root_elem).find('input');

        let parseElemOptions = function(elem) {
            let opts = JSON.parse(elem.getAttribute("opts"));

            /* Parse any numerical options from string to floating point */
            for (let key in opts) {
                let parsed = Number(opts[key]);
                if (!isNaN(parsed)) {
                    opts[key] = parsed;
                }
            }
            return opts;
        }

        const button_tooltips = {
            "pl-point": "Add point",
            "pl-vector": "Add vector",
            "pl-double-headed-vector": "Add double headed vector",
            "pl-arc-vector-CW": "Add clockwise arc vector",
            "pl-arc-vector-CCW": "Add counter-clockwise arc vector",
            "pl-distributed-load": "Add distributed load",
            "delete": "Delete selected object",
            "help-line": "Add help line"
        };

        /* Set all button icons */
        let drawing_btns = $(root_elem).find("button");
        let image_base_url = elem_options['client_files'];
        drawing_btns.each(function(i, btn) {
            let img = btn.children[0];
            let file_name = img.parentNode.name;

            /* Have special cases for the 'pl-distributed-load' icon, which
               can take different icons based on the width parameters */
            if (file_name.toLowerCase() === "pl-distributed-load") {
                let wdef = {w1: 60, w2: 60, anchor_is_tail: false};
                let opts = parseElemOptions(img.parentNode);
                opts = _.defaults(opts, wdef);
                let w1 = opts['w1'];
                let w2 = opts['w2'];
                let anchor = opts['anchor_is_tail'];

                if (w1 == w2) {
                    file_name = "DUD";
                } else if ((w1 < w2) && (anchor === 'true')) {
                    file_name = "DTDA";
                } else if ((w1 < w2)) {
                    file_name = "DTUD";
                } else if ((w1 > w2) && (anchor === 'true')) {
                    file_name = "DTUA";
                } else {
                    file_name = "DTDD";
                }
            }

            img.setAttribute("src", image_base_url + file_name + ".svg");
            if (file_name in button_tooltips) {
                btn.setAttribute('title', button_tooltips[file_name]);
            }
        });
        // ================================================================================
        // ================================================================================
        // ================================================================================
        // ================================================================================
        // First we draw all the fixed objects

        var answerName = 'objects';
        const renderScale = elem_options['render_scale'];

        /* Render at a higher resolution if requested */
        canvas_elem.width = canvas_width * renderScale;
        canvas_elem.height = canvas_height * renderScale;

        if (elem_options.editable) {
            var canvas = new fabric.Canvas(canvas_elem);
        } else {
            var canvas = new fabric.StaticCanvas(canvas_elem);
        }
        canvas.selection = false; // disable group selection

        /* Re-scale the html elements */
        canvas.viewportTransform[0] = renderScale;
        canvas.viewportTransform[3] = renderScale;
        canvas_elem.parentElement.style.width = canvas_width + "px";
        canvas_elem.parentElement.style.height = canvas_height + "px";
        $(canvas_elem.parentElement).children("canvas").width(canvas_width);
        $(canvas_elem.parentElement).children("canvas").height(canvas_height);

        canvas.on("object:added", (ev) => {
            ev.target.cornerSize *= renderScale;
            ev.target.borderColor = 'rgba(102,153,255,1.0)';
        });
        
        if (elem_options.grid_size != 0) {
            mechanicsObjects.addCanvasBackground(canvas, canvas_width, canvas_height, elem_options.grid_size);
        }

        // Restrict objects from being able to be dragged off-canvas
        // From: https://stackoverflow.com/questions/22910496/move-object-within-canvas-boundary-limit
        canvas.on('object:moving', function (e) {
            var obj = e.target;
            // if object is too big ignore,
            if (obj.currentHeight > canvas_width ||
                obj.currentWidth > canvas_height) {
                return;
            }
            let rect = obj.getBoundingRect(true, true);

            // top-left  corner
            if (rect.top < 0 || rect.left < 0) {
                obj.top = Math.max(obj.top, obj.top - rect.top);
                obj.left = Math.max(obj.left, obj.left-rect.left);
            }
            // bot-right corner
            if (rect.top+rect.height > canvas_height ||
                rect.left+rect.width > canvas_width) {
                obj.top = Math.min(obj.top, canvas_height - rect.height + obj.top-rect.top);
                obj.left = Math.min(obj.left, canvas_width - rect.width + obj.left-rect.left);
            }

            /* snap the element to the grid if enabled */
            if (elem_options.snap_to_grid) {
                obj.top = Math.round(obj.top / elem_options.grid_size) * elem_options.grid_size;
                obj.left = Math.round(obj.left / elem_options.grid_size) * elem_options.grid_size;
            }

            obj.setCoords();
        });

        let answerData = {};
        let submittedAnswer = {
            'has': function(key) { return key in answerData; },
            'set': function(key, value) {
                answerData[key] = value;
                /* Correctly escape double back-slashes... (\\) */
                let temp = JSON.stringify(answerData).replace("\\\\", "\\\\\\\\");
                html_input.val(temp);
            },
            'get': function(key) { return answerData[key]; }
        };

        if (submitted_answer != null) {
            answerData = submitted_answer;
            mechanicsObjects.restoreSubmittedAnswer(canvas, submittedAnswer, answerName);
        }

        /* Button handlers */
        let handlers = {};

        let arc_vec_options = {
          radius: 30,
          stroke: '#800080',
          strokeWidth: 3,
          originX:'center',
          originY: 'center',
          padding: 30,
          trueHandles: ['mtr'],
          drawCenterPoint:true,
          startAngle: 30,
          endAngle: 230,
          gradingName: 'arc_vector',
          graded: true,
        }

        handlers["pl-arc-vector-CCW"] = function(options) {
            let options2 = _.defaults(options, arc_vec_options);
            let def = {
                left: 0.1*canvas_width,
                top: 0.2*canvas_width,
                drawStartArrow: true,
                drawEndArrow: false,
            };
            let opts = _.defaults(options2, def);
            mechanicsObjects.addArcVector(canvas, opts, submittedAnswer, answerName);
        }

        handlers["pl-arc-vector-CW"] = function(options) {
            let options2 = _.defaults(options, arc_vec_options);
            let def = {
              left: 0.2*canvas_width,
              top: 0.2*canvas_width,
              drawStartArrow: false,
              drawEndArrow: true,
            };
            let opts = _.defaults(options2, def);
            mechanicsObjects.addArcVector(canvas, opts, submittedAnswer, answerName);
        }

        handlers["pl-vector"] = function(options) {
            let def = {
                left: 80, //0.8*canvas_width,
                top: 80, //0.9*canvas_height,
                width: 60,
                stroke: '#b71c0c',
                strokeWidth: 3,
    	          originX:'center',
                originY: 'center',
                padding: 6,
                trueHandles: ['mtr'],
                drawStartArrow: false,
                drawEndArrow: true,
                angle: 0,
                gradingName: 'vector',
                graded: true,
            };
            let opts = _.defaults(options, def);
            mechanicsObjects.addArrow(canvas, opts, submittedAnswer, answerName);
        }

        handlers["pl-double-headed-vector"] = function(options) {
            let def = {
                left: 80,
                top: 40,
                width: 60,
                stroke: '#b71c0c',
                strokeWidth: 3,
                originX:'center',
                originY: 'center',
                padding: 6,
                trueHandles: ['mtr'],
                drawStartArrow: false,
                drawEndArrow: true,
                angle: 0,
                gradingName: 'double_headed_vector',
                graded: true,
            };
            let opts = _.defaults(options, def);
            mechanicsObjects.addDoubleArrow(canvas, opts, submittedAnswer, answerName);
        }

        handlers["pl-point"] = function(options) {
            let def = {
                left: 40, //0.8*canvas_width,
                top: 40, //0.9*canvas_height,
                radius: 4,
                fill: 'blue',
                stroke: 'blue',
                strokeWidth: 1,
    	        originX:'center',
                originY: 'center',
                padding: 12,
                gradingName: 'point',
                graded: true,
            };
            let opts = _.defaults(options, def);
            mechanicsObjects.addCircle(canvas, opts, submittedAnswer, answerName);
        }

        handlers["pl-distributed-load"] = function(options) {
            var width  = 80;
            let def = {
                left: 0.8*canvas_width,
                top: 0.8*canvas_height,
                width: width,
                range: width,
                stroke: '#0057a0',
                strokeWidth: 3,
                spacing: 20,
                w1: 60,
                w2: 60,
                label1: '',
                offsetx1: 0,
                offsety1: 0,
                label2: '',
                offsetx2: 0,
                offsetx2: 0,
                angle: 0,
                anchor_is_tail: false,
                gradingName: 'distTrianLoad',
                graded: true,
            };

            let opts = _.defaults(options, def);
            mechanicsObjects.addDistTrianLoad(canvas, opts, submittedAnswer, answerName);
        }

        var etc = 0; // an easter egg...?
        handlers["pl-controlled-line"] = function(options) {
            let def = {
                x1: 0.5*canvas_width - (etc==1 ? 50 : -50),
                y1: 0.5*canvas_height - 25,
                x2: 0.5*canvas_width - (etc==1 ? 50 : -50),
                y2: 0.5*canvas_height + 25,
                handleRadius: 6,
                strokeWidth: 4,
                stroke: 'red',
                gradingName: "controlledLine",
                graded: true,
            };
            etc = 1.0 - etc;
            let opts = _.defaults(options, def);
	    mechanicsObjects.addControlledLine(canvas, opts, submittedAnswer, answerName);
        };

        handlers["pl-controlled-curved-line"] = function(options) {
            var def = {
                x1: 0.5*canvas_width - 70,
                y1: 0.5*canvas_height + 50,
                x2: 0.5*canvas_width,
                y2: 0.5*canvas_height + 120,
                x3: 0.5*canvas_width + 70,
                y3: 0.5*canvas_height + 50,
                handleRadius: 6,
                strokeWidth: 4,
                stroke: "red",
                gradingName: "controlledCurvedLine",
                graded: true,
            };
            let opts = _.defaults(options, def);
	    mechanicsObjects.addControlledCurvedLine(canvas, opts, submittedAnswer, answerName);
        };

        handlers["help-line"] = function(options) {
            let def = {
                left: 40,
                top: 40,
                x1: 40,
                x2: 140,
                y1: 40,
                y2: 40,
                trueHandles: ['mtr', 'ml', 'mr'],
                stroke: '#0057a0',
                strokeWidth: 1,
                strokeDashArray: [4,4],
                padding: 10,
                graded: false,
            };
            let opts = _.defaults(options, def);
            obj = mechanicsObjects.addLine(canvas, opts, submittedAnswer, answerName);
        }

        handlers["delete"] = function(options) {
            canvas.remove(canvas.getActiveObject());
        };

        /* Attach click handlers */
        drawing_btns.each(function(i, btn) {
            let id = btn.name;
            let opts = parseElemOptions(btn);
            if (id in handlers) {
                $(btn).click(() => handlers[id](_.clone(opts)));
            }
        });
    }
})()
