/* global window, _, $, fabric, mechanicsObjects */

/**
 * Base element class.
 */
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
class PLDrawingBaseElement {
  /**
   * Generates a canvas representation of an element from given options.
   * This should set up all handlers for saving the element to the submittedAnswer.
   * @param canvas Fabric canvas to create the object onto.
   * @param options Element options
   * @param submittedAnswer Answer state.
   */
  static generate(_canvas, _options, _submittedAnswer) {
    return null;
  }

  /**
   * Function that is called on pressing this element's control button.
   * You can usually leave this as the default.
   * @param canvas Fabric canvas to create the object onto.
   * @param options Element options
   * @param submittedAnswer Answer state.
   */
  static button_press(canvas, options, submittedAnswer) {
    return this.generate(canvas, options, submittedAnswer);
  }

  /**
   * Get the filename for this element's button icon.  This is relative to the clientFiles directory.
   * You can leave this as the default if your element's icon has the same name as its type.
   * @param options Element options.
   */
  static get_button_icon(options) {
    return options.type;
  }

  /**
   * Get the "tooltip" for the element button.  This is displayed when the user hovers their mouse
   * over the button.
   * @param options Element options.
   */
  static get_button_tooltip(options) {
    return `Add ${options.type}`;
  }
}

/**
 * Base functions to be used by element objects and extensions.
 */
window.PLDrawingApi = {
  _idCounter: 0,

  /**
   * Generates a new numeric ID for a submission object.
   * Each submitted object is uniquely identified by its ID.
   */
  generateID() {
    return this._idCounter++;
  },

  elements: {},
  elementModule: {},
  /**
   * Register a dictionary of elements.  These should map element names
   * to a static class corresponding to the element itself.
   * Python options dictionary.
   * @param extensionName Name of the extension/group of elements.
   * @param dictionary Dictionary of elements to register.
   */
  registerElements(extensionName, dictionary) {
    _.extend(this.elements, dictionary);
    Object.keys(dictionary).forEach((elem) => {
      this.elementModule[elem] = extensionName;
    });
  },

  /**
   * Generate an element from an options dictionary.
   * @param canvas Canvas to create the element on.
   * @param options Element options.  Must contain a 'type' key.
   * @param submittedAnswer Answer state object.
   */
  createElement(canvas, options, submittedAnswer) {
    const name = options.type;
    let added = null;

    if (name in this.elements) {
      const element = this.elements[name];
      element.generate(canvas, options, submittedAnswer);
    } else {
      console.warn('No element type: ' + name);
    }

    return added;
  },

  /**
   * Get an element definition by its name.
   * @param name Name of the element to look up.
   * @returns The element, if found.  Silently fails with the base element otherwise.
   */
  getElement(name) {
    let ret = PLDrawingBaseElement;
    if (name in this.elements) {
      let elem = this.elements[name];
      if ('generate' in elem) {
        ret = elem;
      }
    }
    return ret;
  },

  /**
   * Restore the drawing canvas state from a submitted answer.
   * @param canvas Canvas to restore state onto.
   * @param submittedAnswer Answer state to restore from.
   */
  restoreAnswer(canvas, submittedAnswer) {
    for (const [id, obj] of Object.entries(submittedAnswer._answerData)) {
      this._idCounter = Math.max(parseInt(id) + 1, this._idCounter);
      let newObj = JSON.parse(JSON.stringify(obj));
      this.createElement(canvas, newObj, submittedAnswer);
    }
  },

  /**
   * Main entrypoint for the drawing element.
   * Creates canvas at a given root element.
   * @param root_elem DIV that holds the canvas.
   * @param elem_options Any options to give to the element
   * @param existing_answer_submission Existing submission to place on the canvas.
   */
  setupCanvas(root_elem, elem_options, existing_answer_submission) {
    let canvas_elem = $(root_elem).find('canvas')[0];
    let canvas_width = parseFloat(elem_options.width);
    let canvas_height = parseFloat(elem_options.height);
    let html_input = $(root_elem).find('input');

    let parseElemOptions = function (elem) {
      let opts = JSON.parse(elem.getAttribute('opts'));

      // Parse any numerical options from string to floating point
      for (let key in opts) {
        let parsed = Number(opts[key]);
        if (!isNaN(parsed)) {
          opts[key] = parsed;
        }
      }
      return opts;
    };

    // Set all button icons
    let drawing_btns = $(root_elem).find('button');
    const image_base_url = elem_options['client_files'];
    const element_base_url = elem_options['element_client_files'];
    drawing_btns.each(function (i, btn) {
      let img = btn.children[0];
      const opts = parseElemOptions(img.parentNode);
      const elem = window.PLDrawingApi.getElement(opts.type);
      const elem_name = opts.type;
      if (elem !== null) {
        let image_filename = elem.get_button_icon(opts);
        if (image_filename !== null) {
          if (!image_filename.endsWith('.svg')) {
            image_filename += '.svg';
          }
          let base = image_base_url;
          if (window.PLDrawingApi.elementModule[elem_name] !== '_base') {
            base = element_base_url[window.PLDrawingApi.elementModule[elem_name]] + '/';
          }
          img.setAttribute('src', base + image_filename);
        }
        let image_tooltip = elem.get_button_tooltip(opts);
        if (image_tooltip !== null) {
          btn.setAttribute('title', image_tooltip);
        }
        let cloned_opts = _.clone(opts || {});
        $(btn).click(() => elem.button_press(canvas, cloned_opts, submittedAnswer));
      }
    });

    // Render at a higher resolution if requested
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

    // Re-scale the html elements
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

    if (elem_options.grid_size > 0) {
      mechanicsObjects.addCanvasBackground(
        canvas,
        canvas_width,
        canvas_height,
        elem_options.grid_size,
      );
    }

    // Restrict objects from being able to be dragged off-canvas
    // From: https://stackoverflow.com/questions/22910496/move-object-within-canvas-boundary-limit
    canvas.on('object:moving', function (e) {
      var obj = e.target;
      // if object is too big ignore,
      if (obj.currentHeight > canvas_width || obj.currentWidth > canvas_height) {
        return;
      }
      let rect = obj.getBoundingRect(true, true);

      // top-left  corner
      if (rect.top < 0 || rect.left < 0) {
        obj.top = Math.max(obj.top, obj.top - rect.top);
        obj.left = Math.max(obj.left, obj.left - rect.left);
      }
      // bot-right corner
      if (rect.top + rect.height > canvas_height || rect.left + rect.width > canvas_width) {
        obj.top = Math.min(obj.top, canvas_height - rect.height + obj.top - rect.top);
        obj.left = Math.min(obj.left, canvas_width - rect.width + obj.left - rect.left);
      }
      // snap the element to the grid if enabled
      if (elem_options.snap_to_grid) {
        obj.top = Math.round(obj.top / elem_options.grid_size) * elem_options.grid_size;
        obj.left = Math.round(obj.left / elem_options.grid_size) * elem_options.grid_size;
      }

      obj.setCoords();
    });

    fabric.util.addListener(canvas.upperCanvasEl, 'dblclick', function (e) {
      const target = canvas.findTarget(e);
      if (target !== undefined) {
        target.fire('dblclick', { e });
      }
    });

    // Restore existing answer if it exists
    const submittedAnswer = new PLDrawingAnswerState(html_input);
    if (existing_answer_submission != null) {
      submittedAnswer._set(existing_answer_submission);
      window.PLDrawingApi.restoreAnswer(canvas, submittedAnswer);
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
    obj_ary.forEach((object) => {
      this._answerData[object.id] = object;
    });
  }

  _updateAnswerInput() {
    // Correctly escape double back-slashes... (\\)
    let temp = JSON.stringify(_.values(this._answerData)).replace('\\\\', '\\\\\\\\');
    this._htmlInput.val(temp);
  }

  /**
   * Update an object in the submitted answer state.
   * @param object Object to update.
   */
  updateObject(object) {
    if (object.id in this._answerData) {
      if (this._answerData[object.id].type !== object.type) {
        console.trace(
          `Trying to set id ${object.id} from type ${this._answerData[object.id].type} to ${
            object.type
          }`,
        );
        console.warn('Existing', this._answerData[object.id]);
        console.warn('New', object);
      }
    }
    this._answerData[object.id] = object;
    this._updateAnswerInput();
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
    this._updateAnswerInput();
  }

  /**
   * Registers an object to save to the answer when modified.
   * This maintains a "submission" object that is separate from the canvas object.
   * By default, all properties from the canvas object are copied to the submission object.
   *
   * @param options Options that were passed to the 'generate()' function.
   * @param object Canvas object that was created and should be saved.
   * @param modifyHandler {optional} Function that is run whenever the canvas object is modified.
   * This has the signature of (submitted_object, canvas_object).
   * Any properties that should be saved should be copied from canvas_object into
   * submitted_object.  If this is omitted, all properties from the canvas object
   * are copied as-is.
   * @removeHandler {optional} Function that is run whenever the canvas object is deleted.
   */
  registerAnswerObject(options, object, modifyHandler, removeHandler) {
    let submitted_object = _.clone(options);
    if (!('id' in submitted_object)) {
      if (!('id' in object)) {
        submitted_object.id = window.PLDrawingApi.generateID();
      } else {
        submitted_object.id = object.id;
      }
    }

    const blocked_keys = new Set([
      'aCoords',
      'borderColor',
      'cacheHeight',
      'cacheTranslationX',
      'cacheTranslationY',
      'cacheWidth',
      'canvas',
      'cornerSize',
      'dirty',
      'isMoving',
      'matrixCache',
      'oCoords',
      'ownCaching',
      'ownMatrixCache',
      'id',
    ]);

    this.updateObject(submitted_object);
    object.on('modified', () => {
      if (modifyHandler) {
        modifyHandler(submitted_object, object);
      } else {
        for (const [key, value] of Object.entries(object)) {
          if (key[0] !== '_' && !blocked_keys.has(key)) {
            submitted_object[key] = value;
          }
        }
      }
      this.updateObject(submitted_object);
    });
    object.on('removed', () => {
      if (removeHandler) {
        removeHandler(submitted_object, object);
      }
      this.deleteObject(submitted_object);
    });
  }
}

// Set up built-in buttons
(() => {
  class DrawingDeleteButton extends PLDrawingBaseElement {
    static get_button_icon() {
      return 'delete';
    }
    static get_button_tooltip() {
      return 'Delete selected object';
    }
    static button_press(canvas, _options, _submittedAnswer) {
      canvas.remove(canvas.getActiveObject());
    }
  }
  class DrawingHelpLineButton extends PLDrawingBaseElement {
    static generate(canvas, options, submittedAnswer) {
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
        strokeDashArray: [4, 4],
        padding: 10,
        graded: false,
      };
      let opts = _.defaults(options, def);
      opts.type = 'pl-line';
      window.PLDrawingApi.createElement(canvas, opts, submittedAnswer);
    }
    static get_button_icon() {
      return 'help-line';
    }
    static get_button_tooltip() {
      return 'Add help line';
    }
  }

  const builtins = {
    delete: DrawingDeleteButton,
    'help-line': DrawingHelpLineButton,
  };

  window.PLDrawingApi.registerElements('_base', builtins);
})();
