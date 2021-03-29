window.onload = function () { DiagramEditor.staticInit() }
function DiagramEditor() {
	this.config = {
		// "enabledLibraries": [],
		"defaultLibraries": "general;uml;er;bpmn;flowchart;basic;FFSM_DIAG_LIB.xml",
		"defaultCustomLibraries": ["https%3A%2F%2Fraw.githubusercontent.com%2FPrairieLearn%2FPrairieLearn%2Fpl-diagram%2Felements%2Fpl-diagram%2FclientFilesElement%2FFSM_DIAG_LIB.xml"]
		// "autosaveDelay": 1000,
		// "libraries":["general"]	,
		// "defaultLibraries":""
	};

	var self = this;

	this.handleMessageEvent = function (evt) {
		if (self.frame != null && evt.source == self.frame.contentWindow &&
			evt.data.length > 0) {
			try {
				var msg = JSON.parse(evt.data);

				if (msg != null) {
					self.handleMessage(msg);
				}
			}
			catch (e) {
				console.error(e);
			}
		}
	};
};

/**
 * Static method to edit the diagram in the given img or object.
 */
DiagramEditor.staticInit = function () {
	return new DiagramEditor().editElement();
};

/**
 * Global configuration.
 */
DiagramEditor.prototype.config = null;

/**
 * Protocol and domain to use.
 */
DiagramEditor.prototype.drawDomain = 'https://embed.diagrams.net/';

/**
 * Contains XML for pending image export.
 */
DiagramEditor.prototype.xml = null;

/**
 * Format to use.
 */
DiagramEditor.prototype.format = 'xml';

/**
 * Specifies if libraries should be enabled.
 */
DiagramEditor.prototype.libraries = true;


/**
 * Adds the iframe and starts editing.
 */
DiagramEditor.prototype.editElement = function () {
	var fmt = this.format;
	this.startEditing(fmt);

	return this;
};

/**
 * Adds the iframe and starts editing.
 */
DiagramEditor.prototype.getElementData = function (elem) {
	var name = elem.nodeName.toLowerCase();

	return elem.getAttribute((name == 'svg') ? 'content' :
		((name == 'img') ? 'src' : 'data'));
};


/**
 * Starts the editor for the given data.
 */
DiagramEditor.prototype.startEditing = function (format, title) {
	if (this.frame == null) {
		window.addEventListener('message', this.handleMessageEvent);
		this.format = (format != null) ? format : this.format;
		this.title = (title != null) ? title : this.title;

		this.frame = document.getElementById('diagramFrame');
		this.frame.setAttribute('src', this.getFrameUrl());
		this.setWaiting(true);
	}
};

/**
 * Updates the waiting cursor.
 */
DiagramEditor.prototype.setWaiting = function (waiting) {
	if (this.startElement != null) {
		// Redirect cursor to parent for SVG and object
		var elt = this.startElement;
		var name = elt.nodeName.toLowerCase();

		if (name == 'svg' || name == 'object') {
			elt = elt.parentNode;
		}

		if (elt != null) {
			if (waiting) {
				this.frame.style.pointerEvents = 'none';
				this.previousCursor = elt.style.cursor;
				elt.style.cursor = 'wait';
			}
			else {
				elt.style.cursor = this.previousCursor;
				this.frame.style.pointerEvents = '';
			}
		}
	}
};

/**
 * Updates the waiting cursor.
 */
DiagramEditor.prototype.setActive = function (active) {
	if (active) {
		this.previousOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
	}
	else {
		document.body.style.overflow = this.previousOverflow;
	}
};

/**
 * Removes the iframe.
 */
DiagramEditor.prototype.stopEditing = function () {
	console.log("STOP EDITING")
	if (this.frame != null) {
		window.removeEventListener('message', this.handleMessageEvent);
		this.setActive(false);
		this.frame = null;
	}
};

/**
 * Send the given message to the iframe.
 */
DiagramEditor.prototype.postMessage = function (msg) {
	if (this.frame != null) {
		this.frame.contentWindow.postMessage(JSON.stringify(msg), '*');
	}
};

/**
 * Returns the diagram data.
 */
DiagramEditor.prototype.getData = function () {
	return this.data;
};

/**
 * Returns the title for the editor.
 */
DiagramEditor.prototype.getTitle = function () {
	return this.title;
};

/**
 * Returns the CSS style for the iframe.
 */
DiagramEditor.prototype.getFrameStyle = function () {
	return 'border:0;left:' +
		document.body.scrollLeft + 'px;top:' +
		document.body.scrollTop + 'px;' +
		"width:8000;height:8000;";
};

/**
 * Returns the URL for the iframe.
 */
//TODO: Edit this url with special parameters
DiagramEditor.prototype.getFrameUrl = function () {
	var url = this.drawDomain + '?proto=json&spin=1&embed=1';

	url += "&hide-pages=1"; //Disable format
	url += '&ui=min';
	url += '&libraries=1';
	url += '&libs=;'
	url += "&saveAndExit=0&noSaveBtn=1&noExitBtn=1"; // Disable save and exit buttons
	if (this.config != null) {
		url += '&configure=1';
	}
	url += "&clibs=Uhttps%3A%2F%2Fraw.githubusercontent.com%2FPrairieLearn%2FPrairieLearn%2Fpl-diagram%2Felements%2Fpl-diagram%2FclientFilesElement%2FFSM_DIAG_LIB.xml;"
	console.log(this.config);
	return url;
};

/**
 * Sets the status of the editor.
 */
DiagramEditor.prototype.setStatus = function (messageKey, modified) {
	this.postMessage({ action: 'status', messageKey: messageKey, modified: modified });
};

/**
 * Handles the given message.
 */
DiagramEditor.prototype.handleMessage = function (msg) {
	if (msg.event == 'configure') {
		this.configureEditor();
	}
	else if (msg.event == 'init') {
		this.initializeEditor();
	}
	else if (msg.event == 'autosave') {
		this.save(msg.xml, true, this.startElement);
	}
	else if (msg.event == 'export') {
		this.stopEditing();
		this.xml = null;
	}
	else if (msg.event == 'save') {
		this.save(msg.xml, false, this.startElement);
		this.xml = msg.xml;

		if (msg.exit) {
			msg.event = 'exit';
		}
		else {
			this.setStatus('allChangesSaved', false);
		}
	}

	if (msg.event == 'exit') {
		if (this.format != 'xml') {
			if (this.xml != null) {
				this.postMessage({
					action: 'export', format: this.format,
					xml: this.xml, spinKey: 'export'
				});
			}
			else {
				this.stopEditing(msg);
			}
		}
		else {
			if (msg.modified == null || msg.modified) {
				this.save(msg.xml, false, this.startElement);
			}

			this.stopEditing(msg);
		}
	}
};

/**
 * Posts configure message to editor.
 */
DiagramEditor.prototype.configureEditor = function () {
	this.postMessage({ action: 'configure', config: this.config });
};

/**
 * Posts load message to editor.
 */
DiagramEditor.prototype.initializeEditor = function () {
	this.postMessage({
		action: 'load', autosave: 1, saveAndExit: '1',
		modified: 'unsavedChanges', xml: this.getData(),
		title: this.getTitle()
	});
	this.setWaiting(false);
	this.setActive(true);
	this.initialized();
};

/**
 * Saves the given data.
 */
DiagramEditor.prototype.save = function (data, draft, elt) {
	console.log("save")
	this.done(data, draft, elt);

};

/**
 * Invoked after save.
 */
DiagramEditor.prototype.done = function (data) {
	// hook for subclassers
	parseDiagram(data);

};

/**
 * Invoked after the editor has sent the init message.
 */
DiagramEditor.prototype.initialized = function () {
	// hook for subclassers
};
