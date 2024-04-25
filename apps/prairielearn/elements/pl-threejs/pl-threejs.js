/* eslint-env browser,jquery */
/* global THREE,async */
function PLThreeJS(options) {
  // parse options
  var uuid = options.uuid;
  this.uuid = uuid;
  this.startPose = JSON.parse(atob(options.pose));
  if (Object.prototype.hasOwnProperty.call(options, 'pose_default')) {
    this.resetPose = JSON.parse(atob(options.pose_default));
  } else {
    this.resetPose = this.startPose;
  }
  this.bodyCanTranslate = options.body_cantranslate;
  this.bodyCanRotate = options.body_canrotate;
  this.cameraCanMove = options.camera_canmove;
  this.textPoseFormat = options.text_pose_format;
  this.objects = options.objects;

  // jquery container element
  this.container = $('#pl-threejs-' + uuid);

  // jquery button elements
  this.xPlusButton = $('#x-plus-' + uuid);
  this.xMinusButton = $('#x-minus-' + uuid);
  this.yPlusButton = $('#y-plus-' + uuid);
  this.yMinusButton = $('#y-minus-' + uuid);
  this.zPlusButton = $('#z-plus-' + uuid);
  this.zMinusButton = $('#z-minus-' + uuid);

  // jquery text display elements
  this.matlabText = $('#matlab-data-' + uuid);
  this.pythonText = $('#python-data-' + uuid);

  // jquery hidden input element
  this.hiddenInput = $('#hidden-input-' + uuid);

  // global THREE options
  THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

  // renderer
  this.minimumwidth = 400;
  this.aspectratio = 4 / 3;
  this.width = Math.max(this.container.width(), this.minimumwidth);
  this.height = this.width / this.aspectratio;
  this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  this.renderer.setSize(this.width, this.height);
  this.renderer.shadowMap.enabled = true;
  this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // anti-alias shadow
  this.container.append(this.renderer.domElement);
  this.renderer.domElement.style.borderWidth = 'medium'; // FIXME: fix flickering border on resize in Chrome

  // camera
  this.camera = new THREE.PerspectiveCamera(75, this.aspectratio, 0.1, 1000);
  this.camera.position.fromArray(this.startPose.camera_position);
  this.camera.up.set(0, 0, 1); // z-up
  this.camera.lookAt(0, 0, 0); // ignore this.startPose.camera_orientation even if it exists

  // scene
  this.scene = new THREE.Scene();

  // groups
  this.bodyGroup = new THREE.Group();
  this.spaceGroup = new THREE.Group();
  this.bodyObjectGroup = new THREE.Group();
  this.spaceObjectGroup = new THREE.Group();
  this.spaceGroup.add(this.spaceObjectGroup);
  this.bodyGroup.add(this.bodyObjectGroup);

  // lights
  this.scene.add(new THREE.AmbientLight(0xaaaaaa)); //ambient
  this.spaceGroup.add(this.makeLights()); // directional

  // shadows
  this.screen = this.makeScreen();
  this.spaceGroup.add(this.screen);

  // frames
  this.spaceFrame = this.makeFrame();
  this.bodyFrame = this.makeFrame();
  this.spaceGroup.add(this.spaceFrame);
  this.bodyGroup.add(this.bodyFrame);

  // Source: https://github.com/mrdoob/three.js/blob/68daccedef9c9c325cc5f4c929fcaf05229aa1b3/examples/jsm/geometries/TextGeometry.js
  class TextGeometry extends THREE.ExtrudeGeometry {
    constructor(text, parameters = {}) {
      const font = parameters.font;

      if (font === undefined) {
        super(); // generate default extrude geometry
      } else {
        const shapes = font.generateShapes(text, parameters.size);

        // translate parameters to ExtrudeGeometry API

        parameters.depth = parameters.height !== undefined ? parameters.height : 50;

        // defaults

        if (parameters.bevelThickness === undefined) parameters.bevelThickness = 10;
        if (parameters.bevelSize === undefined) parameters.bevelSize = 8;
        if (parameters.bevelEnabled === undefined) parameters.bevelEnabled = false;

        super(shapes, parameters);
      }

      this.type = 'TextGeometry';
    }
  }

  // Source: https://github.com/mrdoob/three.js/blob/68daccedef9c9c325cc5f4c929fcaf05229aa1b3/examples/jsm/loaders/FontLoader.js
  class FontLoader extends THREE.Loader {
    // eslint-disable-next-line @typescript-eslint/no-useless-constructor
    constructor(manager) {
      super(manager);
    }

    load(url, onLoad, onProgress, onError) {
      const loader = new THREE.FileLoader(this.manager);
      loader.setPath(this.path);
      loader.setRequestHeader(this.requestHeader);
      loader.setWithCredentials(this.withCredentials);
      loader.load(
        url,
        (text) => {
          const font = this.parse(JSON.parse(text));

          if (onLoad) onLoad(font);
        },
        onProgress,
        onError,
      );
    }

    parse(json) {
      return new Font(json);
    }
  }

  // Source: https://github.com/mrdoob/three.js/blob/68daccedef9c9c325cc5f4c929fcaf05229aa1b3/examples/jsm/loaders/FontLoader.js
  class Font {
    constructor(data) {
      this.isFont = true;

      this.type = 'Font';

      this.data = data;
    }

    generateShapes(text, size = 100) {
      const shapes = [];
      const paths = createPaths(text, size, this.data);

      for (let p = 0, pl = paths.length; p < pl; p++) {
        shapes.push(...paths[p].toShapes());
      }

      return shapes;
    }
  }

  // Source: https://github.com/mrdoob/three.js/blob/68daccedef9c9c325cc5f4c929fcaf05229aa1b3/examples/jsm/loaders/FontLoader.js
  function createPaths(text, size, data) {
    const chars = Array.from(text);
    const scale = size / data.resolution;
    const line_height =
      (data.boundingBox.yMax - data.boundingBox.yMin + data.underlineThickness) * scale;

    const paths = [];

    let offsetX = 0,
      offsetY = 0;

    for (const char of chars) {
      if (char === '\n') {
        offsetX = 0;
        offsetY -= line_height;
      } else {
        const ret = createPath(char, scale, offsetX, offsetY, data);
        offsetX += ret.offsetX;
        paths.push(ret.path);
      }
    }

    return paths;
  }

  // Source: https://github.com/mrdoob/three.js/blob/68daccedef9c9c325cc5f4c929fcaf05229aa1b3/examples/jsm/loaders/FontLoader.js
  function createPath(char, scale, offsetX, offsetY, data) {
    const glyph = data.glyphs[char] || data.glyphs['?'];

    if (!glyph) {
      console.error(
        'THREE.Font: character "' +
          char +
          '" does not exists in font family ' +
          data.familyName +
          '.',
      );

      return;
    }

    const path = new THREE.ShapePath();

    let x, y, cpx, cpy, cpx1, cpy1, cpx2, cpy2;

    if (glyph.o) {
      const outline = glyph._cachedOutline || (glyph._cachedOutline = glyph.o.split(' '));

      for (let i = 0, l = outline.length; i < l; ) {
        const action = outline[i++];

        switch (action) {
          case 'm': // moveTo
            x = outline[i++] * scale + offsetX;
            y = outline[i++] * scale + offsetY;

            path.moveTo(x, y);

            break;

          case 'l': // lineTo
            x = outline[i++] * scale + offsetX;
            y = outline[i++] * scale + offsetY;

            path.lineTo(x, y);

            break;

          case 'q': // quadraticCurveTo
            cpx = outline[i++] * scale + offsetX;
            cpy = outline[i++] * scale + offsetY;
            cpx1 = outline[i++] * scale + offsetX;
            cpy1 = outline[i++] * scale + offsetY;

            path.quadraticCurveTo(cpx1, cpy1, cpx, cpy);

            break;

          case 'b': // bezierCurveTo
            cpx = outline[i++] * scale + offsetX;
            cpy = outline[i++] * scale + offsetY;
            cpx1 = outline[i++] * scale + offsetX;
            cpy1 = outline[i++] * scale + offsetY;
            cpx2 = outline[i++] * scale + offsetX;
            cpy2 = outline[i++] * scale + offsetY;

            path.bezierCurveTo(cpx1, cpy1, cpx2, cpy2, cpx, cpy);

            break;
        }
      }
    }

    return { offsetX: glyph.ha * scale, path };
  }

  async.series(
    [
      // Load font
      function (callback) {
        var loader = new FontLoader();
        loader.load(
          '/node_modules/three/examples/fonts/helvetiker_regular.typeface.json',
          function (font) {
            this.font = font;
            callback(null);
          }.bind(this),
        );
      }.bind(this),
      // Load each stl
      function (callback) {
        async.eachSeries(
          this.objects,
          function (obj, callback) {
            if (obj.type === 'stl') {
              var loader = new THREE.STLLoader();
              loader.load(
                obj.file_url,
                function (geometry) {
                  var material = new THREE.MeshStandardMaterial({
                    color: obj.color,
                    transparent: true,
                    opacity: obj.opacity,
                  });
                  var mesh = new THREE.Mesh(
                    geometry.scale(obj.scale, obj.scale, obj.scale),
                    material,
                  );
                  mesh.castShadow = true;
                  mesh.receiveShadow = true;
                  mesh.position.fromArray(obj.position);
                  mesh.quaternion.fromArray(obj.quaternion);
                  if (obj.frame === 'space') {
                    this.spaceObjectGroup.add(mesh);
                  } else if (obj.frame === 'body') {
                    this.bodyObjectGroup.add(mesh);
                  }
                  // objects_to_drag.push(mesh);
                  callback(null);
                }.bind(this),
              );
            } else if (obj.type === 'txt') {
              var geometry = new TextGeometry(obj.text, {
                font: this.font,
                size: 0.25,
                height: 0.05,
                curveSegments: 12,
                bevelEnabled: true,
                bevelThickness: 0.01,
                bevelSize: 0.008,
                bevelSegments: 2,
              });
              var material = new THREE.MeshStandardMaterial({
                color: obj.color,
                transparent: false,
                opacity: obj.opacity,
              });
              var mesh = new THREE.Mesh(geometry.scale(obj.scale, obj.scale, obj.scale), material);
              // FIXME: avoid this hack with renderOrder (used to render text first
              // so it never "disappears" behind or inside of other transparent objects)
              mesh.renderOrder = 1;
              mesh.castShadow = true;
              mesh.receiveShadow = true;
              mesh.position.fromArray(obj.position);
              mesh.quaternion.fromArray(obj.quaternion);
              if (obj.frame === 'space') {
                this.spaceObjectGroup.add(mesh);
              } else if (obj.frame === 'body') {
                this.bodyObjectGroup.add(mesh);
              }
              callback(null);
            } else {
              callback(null);
            }
          }.bind(this),
          function (err) {
            callback(err);
          },
        );
      }.bind(this),
      function (callback) {
        // position and orientation
        this.bodyGroup.quaternion.fromArray(this.startPose.body_quaternion);
        this.bodyGroup.position.fromArray(this.startPose.body_position);

        // add groups to scene
        this.scene.add(this.bodyGroup);
        this.scene.add(this.spaceGroup);

        // render
        this.render();

        // state for mouse control of body pose
        this.isDragging = false;
        this.isTranslating = this.bodyCanTranslate;
        // - rotation
        this.previousMousePosition = {};
        // - translation
        this.raycaster = new THREE.Raycaster();
        this.translateIntersection = new THREE.Vector3();
        this.translatePlane = new THREE.Plane();
        this.translateMouse = new THREE.Vector2();
        this.translateOffset = new THREE.Vector3();

        // buttons to toggle between camera and body motion
        $('#toggle-type-of-motion-' + uuid).change(
          PLThreeJS.prototype.toggleTypeOfMotion.bind(this),
        );

        // mouse control of body pose
        $(this.renderer.domElement).mousedown(PLThreeJS.prototype.onmousedown.bind(this));
        $(this.renderer.domElement).mousemove(PLThreeJS.prototype.onmousemove.bind(this));
        $(document).mouseup(PLThreeJS.prototype.onmouseup.bind(this));

        // buttons to rotate body about coordinate axes of body frame
        this.deltaTranslate = 0.1;
        this.deltaRotate = (5 * Math.PI) / 180;
        this.xPlusButton.click(PLThreeJS.prototype.xPlus.bind(this));
        this.xMinusButton.click(PLThreeJS.prototype.xMinus.bind(this));
        this.yPlusButton.click(PLThreeJS.prototype.yPlus.bind(this));
        this.yMinusButton.click(PLThreeJS.prototype.yMinus.bind(this));
        this.zPlusButton.click(PLThreeJS.prototype.zPlus.bind(this));
        this.zMinusButton.click(PLThreeJS.prototype.zMinus.bind(this));

        // mouse control of camera pose
        //
        // FIXME: use of orbitcontrols with zoom results in a warning on Chrome:
        //
        //  Blink deferred a task in order to make scrolling smoother. Your timer and
        //  network tasks should take less than 50ms to run to avoid this. Please see
        //  https://developers.google.com/web/tools/chrome-devtools/profile/evaluate-performance/rail
        //  and https://crbug.com/574343#c40 for more information.
        //
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enablePan = false;
        this.controls.addEventListener('change', PLThreeJS.prototype.render.bind(this));
        this.controls.enabled = this.cameraCanMove;
        this.updateBodyButtons();

        // buttons to toggle visibility
        $('#pl-threejs-button-bodyobjectsvisible-' + uuid).click(
          PLThreeJS.prototype.toggleBodyObjectsVisible.bind(this),
        );
        $('#pl-threejs-button-spaceobjectsvisible-' + uuid).click(
          PLThreeJS.prototype.toggleSpaceObjectsVisible.bind(this),
        );
        $('#pl-threejs-button-framevisible-' + uuid).click(
          PLThreeJS.prototype.toggleFrameVisible.bind(this),
        );
        $('#pl-threejs-button-shadowvisible-' + uuid).click(
          PLThreeJS.prototype.toggleShadowVisible.bind(this),
        );

        // reset button
        $('#reset-button-' + uuid).click(
          function () {
            this.bodyGroup.quaternion.fromArray(this.resetPose.body_quaternion);
            this.bodyGroup.position.fromArray(this.resetPose.body_position);
            this.camera.position.fromArray(this.resetPose.camera_position);
            this.camera.lookAt(0, 0, 0);
            this.render();
          }.bind(this),
        );

        // resize with window
        $(window).resize(PLThreeJS.prototype.onResize.bind(this));

        callback(null);
      }.bind(this),
    ],
    function (_err, _results) {
      // Do nothing
      return;
    },
  );
}

PLThreeJS.prototype.render = function () {
  this.renderer.render(this.scene, this.camera);
  this.updateHiddenInput();
  this.updateDisplayOfPose();
};

PLThreeJS.prototype.xPlus = function () {
  if (this.isTranslating) {
    this.bodyGroup.translateX(this.deltaTranslate);
  } else {
    this.bodyGroup.rotateX(this.deltaRotate);
  }
  this.render();
};

PLThreeJS.prototype.xMinus = function () {
  if (this.isTranslating) {
    this.bodyGroup.translateX(-this.deltaTranslate);
  } else {
    this.bodyGroup.rotateX(-this.deltaRotate);
  }
  this.render();
};

PLThreeJS.prototype.yPlus = function () {
  if (this.isTranslating) {
    this.bodyGroup.translateY(this.deltaTranslate);
  } else {
    this.bodyGroup.rotateY(this.deltaRotate);
  }
  this.render();
};

PLThreeJS.prototype.yMinus = function () {
  if (this.isTranslating) {
    this.bodyGroup.translateY(-this.deltaTranslate);
  } else {
    this.bodyGroup.rotateY(-this.deltaRotate);
  }
  this.render();
};

PLThreeJS.prototype.zPlus = function () {
  if (this.isTranslating) {
    this.bodyGroup.translateZ(this.deltaTranslate);
  } else {
    this.bodyGroup.rotateZ(this.deltaRotate);
  }
  this.render();
};

PLThreeJS.prototype.zMinus = function () {
  if (this.isTranslating) {
    this.bodyGroup.translateZ(-this.deltaTranslate);
  } else {
    this.bodyGroup.rotateZ(-this.deltaRotate);
  }
  this.render();
};

PLThreeJS.prototype.toggleTypeOfMotion = function () {
  this.isTranslating = !this.isTranslating;
  this.updateBodyButtons();
  this.render();
};

PLThreeJS.prototype.updateBodyButtons = function () {
  if (this.isTranslating && this.bodyCanTranslate) {
    // Remove circular arrows
    $('#x-minus-icon-' + this.uuid).removeClass('fa-rotate-right');
    $('#x-plus-icon-' + this.uuid).removeClass('fa-rotate-left');
    $('#y-minus-icon-' + this.uuid).removeClass('fa-rotate-right');
    $('#y-plus-icon-' + this.uuid).removeClass('fa-rotate-left');
    $('#z-minus-icon-' + this.uuid).removeClass('fa-rotate-right');
    $('#z-plus-icon-' + this.uuid).removeClass('fa-rotate-left');
    // Add straight arrows
    $('#x-minus-icon-' + this.uuid).addClass('fa-arrow-left');
    $('#x-plus-icon-' + this.uuid).addClass('fa-arrow-right');
    $('#y-minus-icon-' + this.uuid).addClass('fa-arrow-left');
    $('#y-plus-icon-' + this.uuid).addClass('fa-arrow-right');
    $('#z-minus-icon-' + this.uuid).addClass('fa-arrow-left');
    $('#z-plus-icon-' + this.uuid).addClass('fa-arrow-right');
  } else if (this.bodyCanRotate) {
    // Remove straight arrows
    $('#x-minus-icon-' + this.uuid).removeClass('fa-arrow-left');
    $('#x-plus-icon-' + this.uuid).removeClass('fa-arrow-right');
    $('#y-minus-icon-' + this.uuid).removeClass('fa-arrow-left');
    $('#y-plus-icon-' + this.uuid).removeClass('fa-arrow-right');
    $('#z-minus-icon-' + this.uuid).removeClass('fa-arrow-left');
    $('#z-plus-icon-' + this.uuid).removeClass('fa-arrow-right');
    // Add circular arrows
    $('#x-minus-icon-' + this.uuid).addClass('fa-rotate-right');
    $('#x-plus-icon-' + this.uuid).addClass('fa-rotate-left');
    $('#y-minus-icon-' + this.uuid).addClass('fa-rotate-right');
    $('#y-plus-icon-' + this.uuid).addClass('fa-rotate-left');
    $('#z-minus-icon-' + this.uuid).addClass('fa-rotate-right');
    $('#z-plus-icon-' + this.uuid).addClass('fa-rotate-left');
  }
};

PLThreeJS.prototype.toggleBodyObjectsVisible = function () {
  this.bodyObjectGroup.visible = !this.bodyObjectGroup.visible;
  this.render();
};

PLThreeJS.prototype.toggleSpaceObjectsVisible = function () {
  this.spaceObjectGroup.visible = !this.spaceObjectGroup.visible;
  this.render();
};

PLThreeJS.prototype.toggleFrameVisible = function () {
  this.bodyFrame.visible = !this.bodyFrame.visible;
  this.spaceFrame.visible = !this.spaceFrame.visible;
  this.render();
};

PLThreeJS.prototype.toggleShadowVisible = function () {
  this.screen.visible = !this.screen.visible;
  this.render();
};

PLThreeJS.prototype.onResize = function () {
  this.width = Math.max(this.container.width(), this.minimumwidth);
  this.height = this.width / this.aspectratio;
  this.renderer.setSize(this.width, this.height);
  this.render();
};

PLThreeJS.prototype.makeLights = function () {
  function makeLight(p) {
    var light = new THREE.DirectionalLight(0xffffff, 0.5);
    light.castShadow = true;
    light.position.copy(p);
    return light;
  }

  var lights = new THREE.Group();
  lights.add(makeLight(new THREE.Vector3(5, 0, 0)));
  lights.add(makeLight(new THREE.Vector3(0, 5, 0)));
  lights.add(makeLight(new THREE.Vector3(0, 0, 5)));
  return lights;
};

PLThreeJS.prototype.makeScreen = function () {
  function makePart() {
    var part = new THREE.Group();

    var geometry = new THREE.PlaneGeometry(10, 10, 1);
    var material = new THREE.ShadowMaterial({ color: 0x888888 });
    var plane = new THREE.Mesh(geometry, material);
    plane.receiveShadow = true;
    plane.position.set(0, 0, -5);
    part.add(plane);

    var grid = new THREE.GridHelper(10, 10, 0xdddddd, 0xdddddd);
    grid.position.set(0, 0, -5);
    grid.quaternion.setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0, 'XYZ'));
    grid.transparent = true;
    grid.opacity = 0.1;
    part.add(grid);

    return part;
  }

  var x = makePart().rotateX(-Math.PI / 2);
  var y = makePart().rotateY(Math.PI / 2);
  var z = makePart();

  var screen = new THREE.Group();
  screen.add(x);
  screen.add(y);
  screen.add(z);

  return screen;
};

PLThreeJS.prototype.makeFrame = function () {
  function makeAxis(whichAxis) {
    var geometry = new THREE.CylinderGeometry(0.05, 0.05, 1);
    var material = new THREE.MeshStandardMaterial({
      transparent: true,
      opacity: 0.9,
    });
    if (whichAxis === 'x' || whichAxis === 'X') {
      geometry.rotateZ(Math.PI / 2);
      geometry.translate(0.5, 0, 0);
      material.color = new THREE.Color(0xff0000);
    } else if (whichAxis === 'y' || whichAxis === 'Y') {
      geometry.rotateX(Math.PI);
      geometry.translate(0, 0.5, 0);
      material.color = new THREE.Color(0x00ff00);
    } else if (whichAxis === 'z' || whichAxis === 'Z') {
      geometry.rotateX(-Math.PI / 2);
      geometry.translate(0, 0, 0.5);
      material.color = new THREE.Color(0x0000ff);
    } else {
      throw "argument to whichAxis() must be 'x', 'y', or 'z'";
    }
    var cylinder = new THREE.Mesh(geometry, material);
    cylinder.castShadow = true;
    return cylinder;
  }

  var x = makeAxis('x');
  var y = makeAxis('y');
  var z = makeAxis('z');

  var frame = new THREE.Object3D();

  frame.add(x);
  frame.add(y);
  frame.add(z);

  return frame;
};

PLThreeJS.prototype.onLoad = function (geometry, materials) {
  var material = materials[0];
  var object = new THREE.Mesh(geometry, material);
  this.scene.add(object);
};

PLThreeJS.prototype.onmousedown = function (event) {
  // only continue if the body can move
  if (!(this.bodyCanRotate || this.bodyCanTranslate)) {
    return;
  }

  // did the user click on something in the bodyGroup?
  var rect = this.renderer.domElement.getBoundingClientRect();
  var x = (event.offsetX / rect.width) * 2 - 1;
  var y = -(event.offsetY / rect.height) * 2 + 1;
  var mouse = new THREE.Vector2(x, y);
  this.raycaster.setFromCamera(mouse, this.camera);
  var intersects = this.raycaster.intersectObjects([this.bodyGroup], true);
  if (intersects.length > 0) {
    // yes, they did!
    // - turn off orbit controls
    this.controls.enabled = false;
    // - turn on dragging
    this.isDragging = true;
    // - state for rotation
    this.previousMousePosition = {
      x: event.offsetX,
      y: event.offsetY,
    };
    // - state for translation
    this.translatePlane.setFromNormalAndCoplanarPoint(
      this.camera.getWorldDirection(this.translatePlane.normal),
      this.bodyGroup.position,
    );
    if (this.raycaster.ray.intersectPlane(this.translatePlane, this.translateIntersection)) {
      this.translateOffset.copy(this.translateIntersection).sub(this.bodyGroup.position);
    }
  }
};

PLThreeJS.prototype.onmousemove = function (e) {
  if (this.isDragging) {
    if (this.isTranslating) {
      var rect = this.renderer.domElement.getBoundingClientRect();
      var x = (event.offsetX / rect.width) * 2 - 1;
      var y = -(event.offsetY / rect.height) * 2 + 1;
      var mouse = new THREE.Vector2(x, y);
      this.raycaster.setFromCamera(mouse, this.camera);
      if (this.raycaster.ray.intersectPlane(this.translatePlane, this.translateIntersection)) {
        this.bodyGroup.position.copy(this.translateIntersection.sub(this.translateOffset));
      }
      this.render();
    } else {
      var deltaMove = {
        x: e.offsetX - this.previousMousePosition.x,
        y: e.offsetY - this.previousMousePosition.y,
      };

      // Orientation of camera
      var qCamera = this.camera.quaternion.clone();
      // Rotation to be applied by mouse motion (in camera frame)
      var qMotion = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(deltaMove.y * (Math.PI / 180), deltaMove.x * (Math.PI / 180), 0, 'XYZ'),
      );
      // Rotation to be applied by mouse motion (in world frame) - note that
      // ".inverse()" modifies qCamera in place, so the order here matters
      qMotion.multiplyQuaternions(qCamera, qMotion);
      qMotion.multiplyQuaternions(qMotion, qCamera.inverse());
      // New orientation of object
      this.bodyGroup.quaternion.multiplyQuaternions(qMotion, this.bodyGroup.quaternion);
      // Render and update hidden input element
      this.render();

      this.previousMousePosition = {
        x: e.offsetX,
        y: e.offsetY,
      };
    }
  }
};

PLThreeJS.prototype.onmouseup = function () {
  if (this.isDragging) {
    this.isDragging = false;
    this.controls.enabled = this.cameraCanMove;
  }
};

PLThreeJS.prototype.updateHiddenInput = function () {
  var val = {
    body_quaternion: this.bodyGroup.quaternion.toArray(),
    body_position: this.bodyGroup.position.toArray(),
    camera_quaternion: this.camera.quaternion.toArray(),
    camera_position: this.camera.position.toArray(),
  };

  this.hiddenInput.val(btoa(JSON.stringify(val)));
};

PLThreeJS.prototype.updateDisplayOfPose = function () {
  function numToString(n, decimals, digits) {
    var s = n.toFixed(decimals);
    s = ' '.repeat(digits - s.length) + s;
    return s;
  }

  function posToMatlab(p) {
    var s = '% The position of the body frame.\n';
    s += 'p = [ ';
    s += numToString(p.x, 4, 7) + ' ;\n      ';
    s += numToString(p.y, 4, 7) + ' ;\n      ';
    s += numToString(p.z, 4, 7) + ' ];';
    return s;
  }

  function posToPython(p) {
    var s = '# The position of the body frame.\n';
    s += 'p = np.array([';
    s += '[ ' + numToString(p.x, 4, 7) + ' ],\n              ';
    s += '[ ' + numToString(p.y, 4, 7) + ' ],\n              ';
    s += '[ ' + numToString(p.z, 4, 7) + ' ]])';
    return s;
  }

  function quatToMatlab(q) {
    var s = '% The orientation of the body frame as a quaternion [x, y, z, w].\n';
    s += 'q = [ ';
    for (var i = 0; i < 4; i++) {
      s += numToString(q[i], 4, 7);
      if (i < 3) {
        s += ' ';
      } else {
        s += ' ];';
      }
    }
    return s;
  }

  function quatToPython(q) {
    var s = '# The orientation of the body frame as a quaternion [x, y, z, w].\n';
    s += 'q = np.array([ ';
    for (var i = 0; i < 4; i++) {
      s += numToString(q[i], 4, 7);
      if (i < 3) {
        s += ', ';
      } else {
        s += ' ])';
      }
    }
    return s;
  }

  function rotToMatlab(R) {
    var s = '% The orientation of the body frame as a rotation matrix.\n';
    s += 'R = [ ';
    for (var i = 0; i < 3; i++) {
      for (var j = 0; j < 3; j++) {
        s += numToString(R[i + 4 * j], 4, 7);
        if (j < 2) {
          s += ' ';
        }
      }
      if (i < 2) {
        s += ' ;\n      ';
      }
    }
    s += ' ];';
    return s;
  }

  function rotToPython(R) {
    var s = '# The orientation of the body frame as a rotation matrix.\n';
    s += 'R = np.array([';
    for (var i = 0; i < 3; i++) {
      s += '[ ';
      for (var j = 0; j < 3; j++) {
        s += numToString(R[i + 4 * j], 4, 7);
        if (j < 2) {
          s += ', ';
        }
      }
      s += ' ]';
      if (i < 2) {
        s += ',\n              ';
      }
    }
    s += '])';
    return s;
  }

  function homToMatlab(R) {
    var s = '% The pose of the body frame as a homogeneous transformation matrix.\n';
    s += 'T = [ ';
    for (var i = 0; i < 4; i++) {
      for (var j = 0; j < 4; j++) {
        s += numToString(R[i + 4 * j], 4, 7);
        if (j < 3) {
          s += ' ';
        }
      }
      if (i < 3) {
        s += ' ;\n      ';
      }
    }
    s += ' ];';
    return s;
  }

  function homToPython(R) {
    var s = '# The pose of the body frame as a homogeneous transformation matrix.\n';
    s += 'T = np.array([';
    for (var i = 0; i < 4; i++) {
      s += '[ ';
      for (var j = 0; j < 4; j++) {
        s += numToString(R[i + 4 * j], 4, 7);
        if (j < 3) {
          s += ', ';
        }
      }
      s += ' ]';
      if (i < 3) {
        s += ',\n              ';
      }
    }
    s += '])';
    return s;
  }

  var matlabText = '';
  var pythonText = 'import numpy as np\n\n';
  if (this.textPoseFormat === 'matrix') {
    // position
    matlabText += posToMatlab(this.bodyGroup.position) + '\n\n';
    pythonText += posToPython(this.bodyGroup.position) + '\n\n';
    // orientation
    matlabText += rotToMatlab(this.bodyGroup.matrix.elements);
    pythonText += rotToPython(this.bodyGroup.matrix.elements);
  } else if (this.textPoseFormat === 'quaternion') {
    // position
    matlabText += posToMatlab(this.bodyGroup.position) + '\n\n';
    pythonText += posToPython(this.bodyGroup.position) + '\n\n';
    // orientation
    matlabText += quatToMatlab(this.bodyGroup.quaternion.toArray());
    pythonText += quatToPython(this.bodyGroup.quaternion.toArray());
  } else if (this.textPoseFormat === 'homogeneous') {
    // both position and orientation
    matlabText += homToMatlab(this.bodyGroup.matrix.elements);
    pythonText += homToPython(this.bodyGroup.matrix.elements);
  }
  this.matlabText.text(matlabText);
  this.pythonText.text(pythonText);
};
