function PLThreeJS(options) {

    // parse options
    var uuid = options.uuid;
    this.initialPose = JSON.parse(atob(options.state));
    this.scale = options.scale;
    this.bodyCanMove = options.body_canmove;
    this.cameraCanMove = options.camera_canmove;
    this.displayFormat = options.format_of_display_orientation;
    this.bodyColor = options.body_color;

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
    THREE.Object3D.DefaultUp.set(0, 0, 1);

    // renderer
    this.minimumwidth = 400;
    this.aspectratio = 4/3;
    this.width = Math.max(this.container.width(), this.minimumwidth);
    this.height = this.width/this.aspectratio;
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setSize(this.width, this.height);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // anti-alias shadow
    this.container.append(this.renderer.domElement);
    this.renderer.domElement.style.borderWidth = "medium"; // FIXME: fix flickering border on resize in Chrome

    // camera
    this.camera = new THREE.PerspectiveCamera(75, this.aspectratio, 0.1, 1000);
    this.camera.position.fromArray(this.initialPose.camera_position);
    this.camera.up.set(0, 0, 1); // z-up
    this.camera.lookAt(0, 0, 0); // ignore this.initialPose.camera_orientation even if it exists

    // scene
    this.scene = new THREE.Scene();

    // lights
    this.scene.add(new THREE.AmbientLight( 0xaaaaaa )); //ambient
    this.scene.add(this.makeLights()); // directional

    // shadows
    this.screen = this.makeScreen();
    this.scene.add(this.screen);

    // space frame
    this.spaceFrame = this.makeFrame();
    this.scene.add(this.spaceFrame);

    // load stl file, then complete setup in a callback
    var loader = new THREE.STLLoader();
    loader.load(options.file_url, (function (geometry) {

        // body frame
        this.bodyFrame = this.makeFrame();

        // body object
        var material = new THREE.MeshStandardMaterial({
            color: this.bodyColor,
            transparent: true,
            opacity: 0.7
        });
        this.bodyObject = new THREE.Mesh(geometry.scale(this.scale, this.scale, this.scale), material);
        this.bodyObject.castShadow = true;
        this.bodyObject.receiveShadow = true;

        // entire body (as a group)
        this.bodyGroup = new THREE.Group();
        this.bodyGroup.add(this.bodyObject);
        this.bodyGroup.add(this.bodyFrame);
        this.bodyGroup.quaternion.fromArray(this.initialPose.body_quaternion);
        this.bodyGroup.position.fromArray(this.initialPose.body_position);
        this.scene.add(this.bodyGroup);

        //  render and update hidden input
        this.render();

        // state for mouse control of body pose
        this.isDragging = false;
        this.previousMousePosition = {
            x: 0,
            y: 0
        };

        // buttons to toggle between camera and body motion
        $('#toggle-view-' + uuid).change(PLThreeJS.prototype.toggleRotate.bind(this));

        // mouse control of body pose
        $(this.renderer.domElement).mousedown(PLThreeJS.prototype.onmousedown.bind(this));
        $(document).mousemove(PLThreeJS.prototype.onmousemove.bind(this));
        $(document).mouseup(PLThreeJS.prototype.onmouseup.bind(this));

        // buttons to rotate body about coordinate axes of body frame
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
        this.controls = new THREE.OrbitControls( this.camera, this.renderer.domElement );
        this.controls.enablePan = false;
        this.controls.addEventListener('change', PLThreeJS.prototype.render.bind(this));
        this.controls.enabled = this.cameraCanMove;
        this.updateBodyButtons();

        // buttons to toggle visibility
        $('#pl-threejs-button-objectvisible-' + uuid).click(PLThreeJS.prototype.toggleObjectVisible.bind(this));
        $('#pl-threejs-button-framevisible-' + uuid).click(PLThreeJS.prototype.toggleFrameVisible.bind(this));
        $('#pl-threejs-button-shadowvisible-' + uuid).click(PLThreeJS.prototype.toggleShadowVisible.bind(this));

        // resize with window
        $(window).resize(PLThreeJS.prototype.onResize.bind(this));
    }).bind(this));
};

PLThreeJS.prototype.render = function() {
    this.renderer.render(this.scene, this.camera);
    this.updateHiddenInput();
    this.updateDisplayOfOrientation();
}

PLThreeJS.prototype.xPlus = function() {
    this.bodyGroup.rotateX(5*Math.PI/180);
    this.render();
};

PLThreeJS.prototype.xMinus = function() {
    this.bodyGroup.rotateX(-5*Math.PI/180);
    this.render();
};

PLThreeJS.prototype.yPlus = function() {
    this.bodyGroup.rotateY(5*Math.PI/180);
    this.render();
};

PLThreeJS.prototype.yMinus = function() {
    this.bodyGroup.rotateY(-5*Math.PI/180);
    this.render();
};

PLThreeJS.prototype.zPlus = function() {
    this.bodyGroup.rotateZ(5*Math.PI/180);
    this.render();
};

PLThreeJS.prototype.zMinus = function() {
    this.bodyGroup.rotateZ(-5*Math.PI/180);
    this.render();
};

PLThreeJS.prototype.toggleRotate = function() {
    this.controls.enabled = !this.controls.enabled;
    this.updateBodyButtons();
    this.render();
};

PLThreeJS.prototype.updateBodyButtons = function() {
    this.xPlusButton.prop('disabled', this.controls.enabled);
    this.xMinusButton.prop('disabled', this.controls.enabled);
    this.yPlusButton.prop('disabled', this.controls.enabled);
    this.yMinusButton.prop('disabled', this.controls.enabled);
    this.zPlusButton.prop('disabled', this.controls.enabled);
    this.zMinusButton.prop('disabled', this.controls.enabled);
};

PLThreeJS.prototype.toggleObjectVisible = function() {
    this.bodyObject.visible = !this.bodyObject.visible;
    this.render();
};

PLThreeJS.prototype.toggleFrameVisible = function() {
    this.bodyFrame.visible = !this.bodyFrame.visible;
    this.spaceFrame.visible = !this.spaceFrame.visible;
    this.render();
};

PLThreeJS.prototype.toggleShadowVisible = function() {
    this.screen.visible = !this.screen.visible;
    this.render();
};

PLThreeJS.prototype.onResize = function() {
    this.width = Math.max(this.container.width(), this.minimumwidth);
    this.height = this.width/this.aspectratio;
    this.renderer.setSize(this.width, this.height);
    this.render();
};

PLThreeJS.prototype.makeLights = function() {
    function makeLight(p) {
        var light = new THREE.DirectionalLight( 0xffffff, 0.5 );
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

PLThreeJS.prototype.makeScreen = function() {
    function makePart() {
        var part = new THREE.Group();

        var geometry = new THREE.PlaneGeometry( 10, 10, 1 );
        var material = new THREE.ShadowMaterial( {color: 0x888888} );
        var plane = new THREE.Mesh( geometry, material );
        plane.receiveShadow = true;
        plane.position.set( 0, 0, -5 );
        part.add( plane );

        var grid = new THREE.GridHelper( 10, 10, 0xdddddd, 0xdddddd );
        grid.position.set(0, 0, -5);
        grid.quaternion.setFromEuler(new THREE.Euler(Math.PI/2, 0, 0, 'XYZ'));
        grid.transparent = true;
        grid.opacity = 0.1;
        part.add(grid);

        return part;
    }

    var x = makePart().rotateX(-Math.PI/2);
    var y = makePart().rotateY(Math.PI/2);
    var z = makePart();

    var screen = new THREE.Group();
    screen.add(x);
    screen.add(y);
    screen.add(z);


    return screen;
};

PLThreeJS.prototype.makeFrame = function() {
    function makeAxis(whichAxis) {
        var geometry = new THREE.CylinderGeometry( 0.05, 0.05, 1 );
        var material = new THREE.MeshStandardMaterial({
            transparent: true,
            opacity: 0.9
        });
        if ((whichAxis == 'x') || (whichAxis == 'X')) {
            geometry.rotateZ(Math.PI/2);
            geometry.translate(0.5, 0, 0);
            material.color = new THREE.Color(0xff0000);
        } else if ((whichAxis == 'y') || (whichAxis == 'Y')) {
            geometry.rotateX(Math.PI);
            geometry.translate(0, 0.5, 0);
            material.color = new THREE.Color(0x00ff00);
        } else if ((whichAxis == 'z') || (whichAxis == 'Z')) {
            geometry.rotateX(-Math.PI/2);
            geometry.translate(0, 0, 0.5);
            material.color = new THREE.Color(0x0000ff);
        } else {
            throw "argument to whichAxis() must be 'x', 'y', or 'z'";
        }
        var cylinder = new THREE.Mesh( geometry, material );
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

PLThreeJS.prototype.onLoad = function( geometry, materials ) {
    var material = materials[ 0 ];
    var object = new THREE.Mesh( geometry, material );
    this.scene.add( object );
};

PLThreeJS.prototype.onmousedown = function() {
    if (!this.controls.enabled) {
        this.isDragging = true;
    }
};

PLThreeJS.prototype.onmousemove = function(e) {
    if (!this.controls.enabled) {
        var deltaMove = {
            x: e.offsetX-this.previousMousePosition.x,
            y: e.offsetY-this.previousMousePosition.y
        };

        if(this.isDragging) {
            // Orientation of camera
            var qCamera = this.camera.quaternion.clone();
            // Rotation to be applied by mouse motion (in camera frame)
            var qMotion = new THREE.Quaternion()
                .setFromEuler(new THREE.Euler(
                    deltaMove.y * (Math.PI / 180),
                    deltaMove.x * (Math.PI / 180),
                    0,
                    'XYZ'
                ));
            // Rotation to be applied by mouse motion (in world frame) - note that
            // ".inverse()" modifies qCamera in place, so the order here matters
            qMotion.multiplyQuaternions(qCamera, qMotion);
            qMotion.multiplyQuaternions(qMotion, qCamera.inverse());
            // New orientation of object
            this.bodyGroup.quaternion.multiplyQuaternions(qMotion, this.bodyGroup.quaternion);
            // Render and update hidden input element
            this.render();
        }

        this.previousMousePosition = {
            x: e.offsetX,
            y: e.offsetY
        };
    }
};

PLThreeJS.prototype.onmouseup = function() {
    if (!this.controls.enabled) {
        if (this.isDragging) {
            this.isDragging = false;
        }
    }
};

PLThreeJS.prototype.updateHiddenInput = function() {

    var val = {
        body_quaternion: this.bodyGroup.quaternion.toArray(),
        body_position: this.bodyGroup.position.toArray(),
        camera_quaternion: this.camera.quaternion.toArray(),
        camera_position: this.camera.position.toArray()
    };

    this.hiddenInput.val(btoa(JSON.stringify(val)));
};

PLThreeJS.prototype.updateDisplayOfOrientation = function() {
    function numToString(n, decimals, digits) {
        var s = n.toFixed(decimals);
        s = ' '.repeat(digits - s.length) + s;
        return s;
    }

    function quatToMatlab(q) {
        var s = '% The quaternion [x, y, z, w] describing the orientation of\n';
        s += '% the body frame in the coordinates of the space frame.\n\n';
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
        var s = '# The quaternion [x, y, z, w] describing the orientation of\n';
        s += '# the body frame in the coordinates of the space frame.\n\n';
        s += 'import numpy as np\n\nq = np.array([ ';
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
        var s = '% The rotation matrix describing the orientation of the body\n';
        s += '% frame in the coordinates of the space frame.\n\n';
        s += 'R = [ ';
        for (var i = 0; i < 3; i++) {
            for (var j = 0; j < 3; j++) {
                s += numToString(R[i + 4*j], 4, 7);
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
        var s = '# The rotation matrix describing the orientation of the body\n';
        s += '# frame in the coordinates of the space frame.\n\n';
        s += 'import numpy as np\n\nR = np.array([';
        for (var i = 0; i < 3; i++) {
            s += '[ '
            for (var j = 0; j < 3; j++) {
                s += numToString(R[i + 4*j], 4, 7);
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

    if (this.displayFormat == "matrix") {
        var R = this.bodyGroup.matrix.elements;
        this.matlabText.text(rotToMatlab(R));
        this.pythonText.text(rotToPython(R));
    } else if (this.displayFormat == "quaternion") {
        var q = this.bodyGroup.quaternion.toArray();
        this.matlabText.text(quatToMatlab(q));
        this.pythonText.text(quatToPython(q));
    }
};
