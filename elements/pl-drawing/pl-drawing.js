/* global window, _, $, fabric, mechanicsObjects */

/**
 * Base functions to be used by element objects and extensions.
 */
window.PLDrawingApi = {
    '_idCounter': 0,
    generateID: function() {
        /**
         * Generates a new numeric ID for a submission object.
         * Each submitted object is uniquely identified by its ID.
         */
        return this._idCounter++;
    },

    'elements': {},
    '_callingContext': {},
    /**
     * Register a dictionary of elements.  These should map element names
     * to a function that creates the element onto the canvas from the relevant
     * Python options dictionary.
     * @param extensionName Name of the extension/group of elements.
     * @param dictionary Dictionary of elements to register.
     * @param callingContext {optional} Context to run the element functions in.
     * Used, for example, if the function depends on a 'this' value.
     */
    registerElements: function(extensionName, dictionary, callingContext) {
        if (callingContext == undefined || callingContext === null) {
            callingContext = this;
        }
        for (const name of Object.keys(dictionary)) {
            this._callingContext[name] = callingContext;
        }
        _.extend(this.elements, dictionary);
    },

    createElement: function(canvas, options, submittedAnswer) {
        const name = options.type;
        let added = null;

        if (name in this.elements) {
            const fcn = this.elements[name];
            const context = this._callingContext[name];
            fcn.call(context, canvas, options, submittedAnswer);
        } else {
            console.warn('No element type: ' + name);
        }

        return added;
    },

    restoreAnswer: function(canvas, submittedAnswer) {
        for (const [id, obj] of Object.entries(submittedAnswer._answerData)) {
            this._idCounter = Math.max(id, this._idCounter);
            let newObj = JSON.parse(JSON.stringify(obj));
            this.createElement(canvas, newObj, submittedAnswer);
        }
    },
};

/**
 * Representation of a submitted answer state.
 * The contents of this are what will be eventually submitted to PrairieLearn.
 */
class PLDrawingAnswerState {
    constructor(html_input) {
        this._answerData = {};
        this._htmlInput = html_input;
    }

    _set(obj_ary) {
        obj_ary.forEach(object => {
            this._answerData[object.id] = object;
        });
    }

    /**
     * Update an object in the submitted answer state.
     * @param object Object to update.
     */
    updateObject(object) {
        this._answerData[object.id] = object;
        /* Correctly escape double back-slashes... (\\) */
        let temp = JSON.stringify(_.values(this._answerData)).replace('\\\\', '\\\\\\\\');
        this._htmlInput.val(temp);
    }

    /**
     * Find an object by its ID.
     * @param id Numeric id to search by.
     * @returns The object, if found.  Null otherwise.
     */
    getObject(id) {
        return this._answerData[id] || null;
    }

    /**
     * Remove an object from the submitted answer.
     * @param object The object to delete, or its ID.
     */
    deleteObject(object) {
        if (_.isObject(object)) {
            object = object.id;
        }
        delete this._answerData[object];
    }
}

(function() {
    window.DrawingInterface = function(root_elem, elem_options, existing_answer_submission) {
        let canvas_elem = $(root_elem).find('canvas')[0];
        let canvas_width = parseFloat(elem_options.width);
        let canvas_height = parseFloat(elem_options.height);
        let html_input = $(root_elem).find('input');

        let parseElemOptions = function(elem) {
            let opts = JSON.parse(elem.getAttribute('opts'));

            /* Parse any numerical options from string to floating point */
            for (let key in opts) {
                let parsed = Number(opts[key]);
                if (!isNaN(parsed)) {
                    opts[key] = parsed;
                }
            }
            return opts;
        };

        const button_tooltips = {
            'pl-point': 'Add point',
            'pl-vector': 'Add vector',
            'pl-double-headed-vector': 'Add double headed vector',
            'pl-arc-vector-CW': 'Add clockwise arc vector',
            'pl-arc-vector-CCW': 'Add counter-clockwise arc vector',
            'pl-distributed-load': 'Add distributed load',
            'delete': 'Delete selected object',
            'help-line': 'Add help line',
        };

        /* Set all button icons */
        let drawing_btns = $(root_elem).find('button');
        let image_base_url = elem_options['client_files'];
        drawing_btns.each(function(i, btn) {
            let img = btn.children[0];
            let file_name = img.parentNode.name;

            /* Have special cases for the 'pl-distributed-load' icon, which
               can take different icons based on the width parameters */
            if (file_name.toLowerCase() === 'pl-distributed-load') {
                let wdef = {w1: 60, w2: 60, anchor_is_tail: false};
                let opts = parseElemOptions(img.parentNode);
                opts = _.defaults(opts, wdef);
                let w1 = opts['w1'];
                let w2 = opts['w2'];
                let anchor = opts['anchor_is_tail'];

                if (w1 == w2) {
                    file_name = 'DUD';
                } else if ((w1 < w2) && (anchor === 'true')) {
                    file_name = 'DTDA';
                } else if ((w1 < w2)) {
                    file_name = 'DTUD';
                } else if ((w1 > w2) && (anchor === 'true')) {
                    file_name = 'DTUA';
                } else {
                    file_name = 'DTDD';
                }
            }

            img.setAttribute('src', image_base_url + file_name + '.svg');
            if (file_name in button_tooltips) {
                btn.setAttribute('title', button_tooltips[file_name]);
            }
        });
        /* Render at a higher resolution if requested */
        const renderScale = elem_options['render_scale'];
        canvas_elem.width = canvas_width * renderScale;
        canvas_elem.height = canvas_height * renderScale;

        let canvas;
        if (elem_options.editable) {
            canvas = new fabric.Canvas(canvas_elem);
        } else {
            canvas = new fabric.StaticCanvas(canvas_elem);
        }
        canvas.selection = false; // disable group selection

        /* Re-scale the html elements */
        canvas.viewportTransform[0] = renderScale;
        canvas.viewportTransform[3] = renderScale;
        canvas_elem.parentElement.style.width = canvas_width + 'px';
        canvas_elem.parentElement.style.height = canvas_height + 'px';
        $(canvas_elem.parentElement).children('canvas').width(canvas_width);
        $(canvas_elem.parentElement).children('canvas').height(canvas_height);

        canvas.on('object:added', (ev) => {
            ev.target.cornerSize *= renderScale;
            ev.target.borderColor = 'rgba(102,153,255,1.0)';
        });

        elem_options.show_bounding = false;
        if (elem_options.show_bounding) {
            canvas.on('after:render', function() {
                canvas.contextContainer.strokeStyle = '#555';

                canvas.forEachObject(function(obj) {
                    var bound = obj.getBoundingRect();

                    canvas.contextContainer.strokeRect(
                        bound.left + 0.5,
                        bound.top + 0.5,
                        bound.width,
                        bound.height,
                    );
                });
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

        const submittedAnswer = new PLDrawingAnswerState(html_input);
        if (existing_answer_submission != null) {
            submittedAnswer._set(existing_answer_submission);
            window.PLDrawingApi.restoreAnswer(canvas, submittedAnswer);
        }

        /* Button handlers */
        let handlers = {};
        handlers['help-line'] = function(options) {
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
            mechanicsObjects.addLine(canvas, opts, submittedAnswer);
        };
        handlers['add-generic'] = function(options) {
            window.PLDrawingApi.createElement(canvas, options, submittedAnswer);
        };
        handlers['delete'] = function(_options) {
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
    };
})();
