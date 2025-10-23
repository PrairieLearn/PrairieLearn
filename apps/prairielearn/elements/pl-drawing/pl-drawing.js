/* global _, fabric, mechanicsObjects */

/**
 * @typedef {object} PLDrawingOptions
 * @property {string} type - The type of drawing element
 * @property {string} width - The width of the drawing canvas
 * @property {string} height - The height of the drawing canvas
 * @property {Record<string, string>} element_client_files - Client files for the element
 * @property {boolean} editable - Whether the drawing is editable
 * @property {number} render_scale - The scale factor for rendering
 * @property {number} grid_size - The size of the grid
 */

/**
 * @typedef {object} PLDrawingSubmittedAnswer
 * @property {Record<string, PLDrawingOptions & Record<string, unknown>>} _answerData - The submitted answer data
 */

/**
 * Base element class.
 */
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
class PLDrawingBaseElement {
  /**
   * Generates a canvas representation of an element from given options.
   * This should set up all handlers for saving the element to the submittedAnswer.
   * @param {typeof fabric.Canvas} _canvas Fabric canvas to create the object onto.
   * @param {PLDrawingOptions} _options Element options
   * @param {PLDrawingSubmittedAnswer} _submittedAnswer Answer state.
   */
  static generate(_canvas, _options, _submittedAnswer) {
    return null;
  }

  /**
   * Function that is called on pressing this element's control button.
   * You can usually leave this as the default.
   * @param {typeof fabric.Canvas} canvas Fabric canvas to create the object onto.
   * @param {PLDrawingOptions} options Element options
   * @param {PLDrawingSubmittedAnswer} submittedAnswer Answer state.
   */
  static button_press(canvas, options, submittedAnswer) {
    return this.generate(canvas, options, submittedAnswer);
  }

  /**
   * Get the filename for this element's button icon.  This is relative to the clientFiles directory.
   * You can leave this as the default if your element's icon has the same name as its type.
   * @param {PLDrawingOptions} options Element options.
   */
  static get_button_icon(options) {
    return options.type;
  }

  /**
   * Get the "tooltip" for the element button.  This is displayed when the user hovers their mouse
   * over the button.
   * @param {PLDrawingOptions} options Element options.
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

  // This will be used to load `.svg` files from the `clientFilesElement` directory.
  clientFilesBase: (() => {
    const currentScript = window.document.currentScript;
    if (!currentScript) throw new Error('currentScript is null');
    const scriptElement = /** @type {HTMLScriptElement} */ (currentScript);
    const url = new URL(scriptElement.src);

    // Strip any search or hash parameters from the URL.
    url.search = '';
    url.hash = '';

    // Strip off the last component of the URL (the script filename).
    url.pathname = url.pathname.split('/').slice(0, -1).join('/');

    // Add the clientFilesElement directory.
    url.pathname += '/clientFilesElement/';

    return url.toString();
  })(),

  /**
   * Generates a new numeric ID for a submission object.
   * Each submitted object is uniquely identified by its ID.
   */
  generateID() {
    return this._idCounter++;
  },

  /** @type {Record<string, typeof PLDrawingBaseElement>} */
  elements: {},
  /** @type {Record<string, string>} */
  elementModule: {},
  /**
   * Register a dictionary of elements.  These should map element names
   * to a static class corresponding to the element itself.
   * Python options dictionary.
   * @param {string} extensionName Name of the extension/group of elements.
   * @param {Record<string, typeof PLDrawingBaseElement>} dictionary Dictionary of elements to register.
   */
  registerElements(extensionName, dictionary) {
    _.extend(this.elements, dictionary);
    Object.keys(dictionary).forEach((elem) => {
      this.elementModule[elem] = extensionName;
    });
  },

  /**
   * Generate an element from an options dictionary.
   * @param {typeof fabric.Canvas} canvas Canvas to create the element on.
   * @param {PLDrawingOptions} options Element options.  Must contain a 'type' key.
   * @param {PLDrawingSubmittedAnswer} submittedAnswer Answer state object.
   */
  createElement(canvas, options, submittedAnswer) {
    const name = options.type;
    const added = null;

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
   * @param {string} name Name of the element to look up.
   * @returns {typeof PLDrawingBaseElement} The element, if found.  Silently fails with the base element otherwise.
   */
  getElement(name) {
    let ret = PLDrawingBaseElement;
    if (name in this.elements) {
      const elem = this.elements[name];
      if ('generate' in elem) {
        ret = elem;
      }
    }
    return ret;
  },

  /**
   * Restore the drawing canvas state from a submitted answer.
   * @param {typeof fabric.Canvas} canvas Canvas to restore state onto.
   * @param {PLDrawingSubmittedAnswer} submittedAnswer Answer state to restore from.
   */
  restoreAnswer(canvas, submittedAnswer) {
    for (const [id, obj] of Object.entries(submittedAnswer._answerData)) {
      this._idCounter = Math.max(Number.parseInt(id) + 1, this._idCounter);
      const newObj = structuredClone(obj);
      this.createElement(canvas, newObj, submittedAnswer);
    }
  },

  /**
   * Main entrypoint for the drawing element.
   * Creates canvas at a given root element.
   * @param {HTMLElement} root_elem DIV that holds the canvas.
   * @param {PLDrawingOptions & Record<string, unknown>} elem_options Any options to give to the element
   * @param {PLDrawingSubmittedAnswer} [existing_answer_submission] Existing submission to place on the canvas.
   */
  setupCanvas(root_elem, elem_options, existing_answer_submission) {
    const canvas_elem = $(root_elem).find('canvas')[0];
    const canvas_width = Number.parseFloat(elem_options.width);
    const canvas_height = Number.parseFloat(elem_options.height);
    const html_input = $(root_elem).find('input');

    /** @param {HTMLElement} elem */
    const parseElemOptions = function (elem) {
      const optsStr = elem.getAttribute('opts');
      if (!optsStr) throw new Error('opts attribute not found');
      const opts = JSON.parse(optsStr);

      // Parse any numerical options from string to floating point
      for (const key in opts) {
        const parsed = Number(opts[key]);
        if (!Number.isNaN(parsed)) {
          opts[key] = parsed;
        }
      }
      return opts;
    };

    // Set all button icons
    const drawing_btns = $(root_elem).find('button');
    const element_base_url = elem_options.element_client_files;
    const clientFilesBase = this.clientFilesBase;
    drawing_btns.each(function (i, btn) {
      const img = btn.children[0];
      const opts = parseElemOptions(/** @type {HTMLElement} */ (img.parentNode));
      // @ts-expect-error - PLDrawingApi is added to window
      const elem = window.PLDrawingApi.getElement(opts.type);
      const elem_name = opts.type;
      if (elem !== null) {
        let image_filename = elem.get_button_icon(opts);
        if (image_filename !== null) {
          if (!image_filename.endsWith('.svg')) {
            image_filename += '.svg';
          }
          let base = clientFilesBase;
          const api = window.PLDrawingApi;
          if (api.elementModule[elem_name] !== '_base') {
            base = element_base_url[api.elementModule[elem_name]] + '/';
          }
          img.setAttribute('src', base + image_filename);
        }
        const image_tooltip = elem.get_button_tooltip(opts);
        if (image_tooltip !== null) {
          btn.setAttribute('title', image_tooltip);
        }
        if (!elem_options.editable) {
          btn.disabled = true;
        }
        const cloned_opts = { ...opts };
        $(btn).click(() => elem.button_press(canvas, cloned_opts, submittedAnswer));
      }
    });

    // Render at a higher resolution if requested
    const renderScale = elem_options.render_scale;
    canvas_elem.width = canvas_width * renderScale;
    canvas_elem.height = canvas_height * renderScale;

    /** @type {InstanceType<typeof fabric.Canvas> | InstanceType<typeof fabric.StaticCanvas>} */
    let canvas;
    if (elem_options.editable) {
      canvas = new fabric.Canvas(canvas_elem);
    } else {
      canvas = new fabric.StaticCanvas(canvas_elem);
    }
    canvas.selection = false; // disable group selection

    // Re-scale the html elements
    if (canvas.viewportTransform) {
      canvas.viewportTransform[0] = renderScale;
      canvas.viewportTransform[3] = renderScale;
    }
    if (canvas_elem.parentElement) {
      canvas_elem.parentElement.style.width = canvas_width + 'px';
      canvas_elem.parentElement.style.height = canvas_height + 'px';
      $(canvas_elem.parentElement).children('canvas').width(canvas_width);
      $(canvas_elem.parentElement).children('canvas').height(canvas_height);
    }

    canvas.on('object:added', (/** @type {any} */ ev) => {
      if (ev.target && ev.target.cornerSize !== undefined) {
        ev.target.cornerSize *= renderScale;
        ev.target.borderColor = 'rgba(102,153,255,1.0)';
      }
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
      const obj = e.target;
      if (!obj) return;
      // if object is too big ignore,
      if (obj.currentHeight > canvas_width || obj.currentWidth > canvas_height) {
        return;
      }
      const rect = obj.getBoundingRect(true, true);

      // top-left  corner
      if (rect.top < 0 || rect.left < 0) {
        obj.top = Math.max(obj.top ?? 0, (obj.top ?? 0) - rect.top);
        obj.left = Math.max(obj.left ?? 0, (obj.left ?? 0) - rect.left);
      }
      // bot-right corner
      if (rect.top + rect.height > canvas_height || rect.left + rect.width > canvas_width) {
        obj.top = Math.min(obj.top ?? 0, canvas_height - rect.height + (obj.top ?? 0) - rect.top);
        obj.left = Math.min(obj.left ?? 0, canvas_width - rect.width + (obj.left ?? 0) - rect.left);
      }
      // snap the element to the grid if enabled
      if (elem_options.snap_to_grid) {
        obj.top = Math.round((obj.top ?? 0) / elem_options.grid_size) * elem_options.grid_size;
        obj.left = Math.round((obj.left ?? 0) / elem_options.grid_size) * elem_options.grid_size;
      }

      obj.setCoords();
    });

    fabric.util.addListener(
      /** @type {any} */ (canvas).upperCanvasEl,
      'dblclick',
      function (/** @type {any} */ e) {
        const target = canvas.findTarget(e);
        if (target !== undefined) {
          target.fire('dblclick', { e });
        }
      },
    );

    // Restore existing answer if it exists
    const submittedAnswer = new PLDrawingAnswerState(html_input);
    if (existing_answer_submission != null) {
      // @ts-expect-error - type signature of existing_answer_submission varies
      submittedAnswer._set(existing_answer_submission);
      // @ts-expect-error - PLDrawingApi is added to window
      window.PLDrawingApi.restoreAnswer(canvas, submittedAnswer);
    }
  },
};

/**
 * Representation of a submitted answer state.
 * The contents of this are what will be eventually submitted to PrairieLearn.
 */
class PLDrawingAnswerState {
  /** @type {Record<string, PLDrawingOptions & Record<string, unknown>>} */
  _answerData;
  /** @type {JQuery} */
  _htmlInput;

  /** @param {JQuery} html_input */
  constructor(html_input) {
    this._answerData = {};
    this._htmlInput = html_input;
  }

  /** @param {Array<PLDrawingOptions & Record<string, unknown> & { id: string | number }>} obj_ary */
  _set(obj_ary) {
    obj_ary.forEach((object) => {
      this._answerData[object.id] = object;
    });
  }

  _updateAnswerInput() {
    // Correctly escape double back-slashes... (\\)
    const temp = JSON.stringify(Object.values(this._answerData)).replaceAll('\\\\', '\\\\\\\\');
    this._htmlInput.val(temp);
  }

  /**
   * Update an object in the submitted answer state.
   * @param {PLDrawingOptions & Record<string, unknown> & { id: string | number }} object Object to update.
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
   * @param {string | number} id Numeric id to search by.
   * @returns {(PLDrawingOptions & Record<string, unknown>) | null} The object, if found.  Null otherwise.
   */
  getObject(id) {
    return this._answerData[id] ?? null;
  }

  /**
   * Remove an object from the submitted answer.
   * @param {(PLDrawingOptions & Record<string, unknown> & { id: string | number }) | string | number} object The object to delete, or its ID.
   */
  deleteObject(object) {
    if (typeof object === 'object') {
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
   * @param {PLDrawingOptions & Record<string, unknown>} options Options that were passed to the 'generate()' function.
   * @param {InstanceType<typeof fabric.Object>} object Canvas object that was created and should be saved.
   * @param {((submitted_object: PLDrawingOptions & Record<string, unknown>, canvas_object: InstanceType<typeof fabric.Object>) => void)} [modifyHandler] Function that is run whenever the canvas object is modified.
   * This has the signature of (submitted_object, canvas_object).
   * Any properties that should be saved should be copied from canvas_object into
   * submitted_object.  If this is omitted, all properties from the canvas object
   * are copied as-is.
   * @param {(() => void)} [removeHandler] Function that is run whenever the canvas object is deleted.
   */
  registerAnswerObject(options, object, modifyHandler, removeHandler) {
    /** @type {PLDrawingOptions & Record<string, unknown> & { id: string | number }} */
    const submitted_object = { ...options, id: 0 };
    if (!('id' in submitted_object) || submitted_object.id === 0) {
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
          if (!key.startsWith('_') && !blocked_keys.has(key)) {
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
  // @ts-expect-error - class extensions are correct but TypeScript has issues with method overrides
  class DrawingDeleteButton extends PLDrawingBaseElement {
    /** @param {PLDrawingOptions} _options */
    static get_button_icon(_options) {
      return 'delete';
    }

    /** @param {PLDrawingOptions} _options */
    static get_button_tooltip(_options) {
      return 'Delete selected object';
    }

    /**
     * @param {typeof fabric.Canvas} canvas
     * @param {PLDrawingOptions} _options
     * @param {PLDrawingSubmittedAnswer} _submittedAnswer
     */
    static button_press(canvas, _options, _submittedAnswer) {
      const activeObj = canvas.getActiveObject();
      if (activeObj) {
        canvas.remove(activeObj);
      }
    }
  }
  // @ts-expect-error - class extensions are correct but TypeScript has issues with method overrides
  class DrawingHelpLineButton extends PLDrawingBaseElement {
    /**
     * @param {typeof fabric.Canvas} canvas
     * @param {PLDrawingOptions} options
     * @param {PLDrawingSubmittedAnswer} submittedAnswer
     */
    static generate(canvas, options, submittedAnswer) {
      const def = {
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
      const opts = { ...def, ...options, type: 'pl-line' };
      window.PLDrawingApi.createElement(canvas, opts, submittedAnswer);
    }

    /** @param {PLDrawingOptions} _options */
    static get_button_icon(_options) {
      return 'help-line';
    }

    /** @param {PLDrawingOptions} _options */
    static get_button_tooltip(_options) {
      return 'Add help line';
    }
  }

  const builtins = {
    delete: DrawingDeleteButton,
    'help-line': DrawingHelpLineButton,
  };

  // @ts-expect-error - PLDrawingApi is added to window
  window.PLDrawingApi.registerElements('_base', builtins);
})();
