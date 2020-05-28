/* eslint-disable */

(function() {
    window.DrawingInterface = function(root_elem, elem_options, submitted_answer) {
        let canvas_elem = $(root_elem).find('canvas')[0];
        let canvas_width = parseFloat(elem_options.width);
        let canvas_height = parseFloat(elem_options.height);
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

        elem_options.show_bounding = true;
        if (elem_options.show_bounding) {
            canvas.on('after:render', function() {
                canvas.contextContainer.strokeStyle = '#555';

                canvas.forEachObject(function(obj) {
                    var bound = obj.getBoundingRect();

                    canvas.contextContainer.strokeRect(
                        bound.left + 0.5,
                        bound.top + 0.5,
                        bound.width,
                        bound.height
                    );
                })
            });
        }
        
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

        fabric.util.addListener(canvas.upperCanvasEl, 'dblclick', function (e) {
            const target = canvas.findTarget(e);
            if (target !== undefined) {
                target.fire('dblclick', {'e': e});
            }
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
            mechanicsObjects.addLine(canvas, opts, submittedAnswer, answerName);
        }
        
        handlers["add-generic"] = function(options) {
            if (options.type in mechanicsObjects.byType) {
                let added = mechanicsObjects.byType[options.type].call(mechanicsObjects, canvas, options, submittedAnswer, answerName);
                console.log(added);
            } else {
                console.warn("No element type: " + options.type);
            }
        }
        
        handlers["delete"] = function(options) {
            canvas.remove(canvas.getActiveObject());
        };

        /* Attach click handlers */
        drawing_btns.each(function(i, btn) {
            let id = btn.name;
            let opts = parseElemOptions(btn);
            if (opts === null) {
                opts = {};
            }
            if (id in handlers) {
                $(btn).click(() => handlers[id](_.clone(opts)));
            } else {
                $(btn).click(() => handlers['add-generic'](_.clone(opts)));
            }
        });
    }
})()
