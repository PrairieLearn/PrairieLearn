/* eslint-env browser,jquery */
/* global THREE,async */
function PLThreeJS(options) {

    // parse options
    var uuid = options.uuid;
    this.startPose = JSON.parse(atob(options.pose));
    if (options.hasOwnProperty('pose_default')) {
        this.resetPose = JSON.parse(atob(options.pose_default));
    } else {
        this.resetPose = this.startPose;
    }
    this.bodyCanMove = options.body_canmove;
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
    this.scene.add(new THREE.AmbientLight( 0xaaaaaa )); //ambient
    this.spaceGroup.add(this.makeLights()); // directional

    // shadows
    this.screen = this.makeScreen();
    this.spaceGroup.add(this.screen);

    // frames
    this.spaceFrame = this.makeFrame();
    this.bodyFrame = this.makeFrame();
    this.spaceGroup.add(this.spaceFrame);
    this.bodyGroup.add(this.bodyFrame);

    var objects_to_drag = [];

    async.series([
        // Load font
        (function(callback) {
            var loader = new THREE.FontLoader();
            loader.load( '/node_modules/three/examples/fonts/helvetiker_regular.typeface.json', (function (font) {
                this.font = font;
                callback(null);
            }).bind(this) );
        }).bind(this),
        // Load each stl
        (function(callback) {
            async.eachSeries(this.objects, (function(obj, callback) {
                if (obj.type == 'stl') {
                    var loader = new THREE.STLLoader();
                    loader.load(obj.file_url, (function (geometry) {
                        var material = new THREE.MeshStandardMaterial({
                            color: obj.color,
                            transparent: true,
                            opacity: obj.opacity,
                        });
                        var mesh = new THREE.Mesh(geometry.scale(obj.scale, obj.scale, obj.scale), material);
                        mesh.castShadow = true;
                        mesh.receiveShadow = true;
                        mesh.position.fromArray(obj.position);
                        mesh.quaternion.fromArray(obj.quaternion);
                        if (obj.frame == 'space') {
                            this.spaceObjectGroup.add(mesh);
                        } else if (obj.frame == 'body') {
                            this.bodyObjectGroup.add(mesh);
                        }
                        // objects_to_drag.push(mesh);
                        callback(null);
                    }).bind(this));
                } else if (obj.type == 'txt') {
                    var geometry = new THREE.TextGeometry(obj.text, {
                        font: this.font,
                        size: 0.25,
                        height: 0.05,
                        curveSegments: 12,
                        bevelEnabled: true,
                        bevelThickness: .01,
                        bevelSize: .008,
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
                    if (obj.frame == 'space') {
                        this.spaceObjectGroup.add(mesh);
                    } else if (obj.frame == 'body') {
                        this.bodyObjectGroup.add(mesh);
                    }
                    callback(null);
                } else {
                    callback(null);
                }
            }).bind(this), function(err) {
                callback(err);
            });
        }).bind(this),
        (function(callback) {
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
            this.previousMousePosition = {
                x: 0,
                y: 0,
            };

            // buttons to toggle between camera and body motion
            $('#toggle-view-' + uuid).change(PLThreeJS.prototype.toggleRotate.bind(this));

            // mouse control of body pose
            this.raycaster = new THREE.Raycaster()
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

            // FIXME
            this.translateIntersection = new THREE.Vector3();
            this.translatePlane = new THREE.Plane();
            this.translateMouse = new THREE.Vector2();
            this.translateOffset = new THREE.Vector3();





            // var anObject = new THREE.Object3D();
            console.log('adding group to object...');
            // anObject.add(this.bodyFrame);
            // anObject.add(this.bodyGroup);
            console.log('...done');
            console.log(anObject);
            // objects_to_drag.push(this.bodyGroup);
            // objects_to_drag.push(anObject);
            console.log('enabling dragControls...');
            console.log(objects_to_drag);
            this.dragControls = new THREE.DragControls( objects_to_drag, this.camera, this.renderer.domElement );
            console.log(this.dragControls);
            console.log('...done');
            console.log('adding listeners...');
			// dragControls.addEventListener( 'dragstart', function ( event ) { controls.enabled = false; } );
			// dragControls.addEventListener( 'dragend', function ( event ) { controls.enabled = true; } );
            this.dragControls.addEventListener( 'dragstart', (function ( event ) { console.log('turn off orbit controls'); this.controls.enabled = false; }).bind(this) );
			this.dragControls.addEventListener( 'dragend', (function ( event ) { console.log('turn on orbit controls'); this.controls.enabled = true; }).bind(this) );
            this.dragControls.addEventListener( 'drag', (function (event) {console.log('dragging...'); this.render(); }).bind(this) );
            console.log('...done');


            // buttons to toggle visibility
            $('#pl-threejs-button-bodyobjectsvisible-' + uuid).click(PLThreeJS.prototype.toggleBodyObjectsVisible.bind(this));
            $('#pl-threejs-button-spaceobjectsvisible-' + uuid).click(PLThreeJS.prototype.toggleSpaceObjectsVisible.bind(this));
            $('#pl-threejs-button-framevisible-' + uuid).click(PLThreeJS.prototype.toggleFrameVisible.bind(this));
            $('#pl-threejs-button-shadowvisible-' + uuid).click(PLThreeJS.prototype.toggleShadowVisible.bind(this));

            // reset button
            $('#reset-button-' + uuid).click( (function(){
                this.bodyGroup.quaternion.fromArray(this.resetPose.body_quaternion);
                this.bodyGroup.position.fromArray(this.resetPose.body_position);
                this.camera.position.fromArray(this.resetPose.camera_position);
                this.camera.lookAt(0, 0, 0);
                this.render();
            }).bind(this));

            // resize with window
            $(window).resize(PLThreeJS.prototype.onResize.bind(this));


            callback(null);
        }).bind(this),
    ], function(_err, _results) {
        // Do nothing
        return;
    });
}

PLThreeJS.prototype.render = function() {
    this.renderer.render(this.scene, this.camera);
    this.updateHiddenInput();
    this.updateDisplayOfOrientation();
};

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

PLThreeJS.prototype.toggleBodyObjectsVisible = function() {
    this.bodyObjectGroup.visible = !this.bodyObjectGroup.visible;
    this.render();
};

PLThreeJS.prototype.toggleSpaceObjectsVisible = function() {
    this.spaceObjectGroup.visible = !this.spaceObjectGroup.visible;
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
            opacity: 0.9,
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

PLThreeJS.prototype.onmousedown = function(event) {
    // only continue if the body can move
    if (!this.bodyCanMove) {
        return;
    }

    // did the user click on something in the bodyGroup
    var rect = this.renderer.domElement.getBoundingClientRect();
    // var x = ( ( event.clientX - rect.left ) / rect.width ) * 2 - 1;
	// var y = - ( ( event.clientY - rect.top ) / rect.height ) * 2 + 1;
    // console.log([x, y, event.clientX, event.clientY, event.offsetX, event.offsetY, event.clientX - rect.left, event.clientY - rect.top]);
    var x = (event.offsetX / rect.width) * 2 - 1;
    var y = - (event.offsetY / rect.height) * 2 + 1;
    var mouse = new THREE.Vector2(x, y);
    this.raycaster.setFromCamera( mouse, this.camera );
    var intersects = this.raycaster.intersectObjects([this.bodyGroup], true);
    if (intersects.length > 0) {
        this.controls.enabled = false;
        this.isDragging = true;
        this.previousMousePosition = {
            x: event.offsetX,
            y: event.offsetY,
        };
        this.translatePlane.setFromNormalAndCoplanarPoint(this.camera.getWorldDirection(this.translatePlane.normal), this.bodyGroup.position);
        if (this.raycaster.ray.intersectPlane(this.translatePlane, this.translateIntersection)) {
            this.translateOffset.copy(this.translateIntersection).sub(this.bodyGroup.position);
        }
        console.log(this.translateOffset);
    }



    // if (!this.controls.enabled && this.bodyCanMove) {
    //     this.isDragging = true;
    // }
    //
    // event.preventDefault();
    //
    // console.log(event);
    // console.log([event.clientX, event.clientY]);
    //
    // var rect = this.renderer.domElement.getBoundingClientRect();
    // var x = ( ( event.clientX - rect.left ) / rect.width ) * 2 - 1;
	// var y = - ( ( event.clientY - rect.top ) / rect.height ) * 2 + 1;
    // var mouse = new THREE.Vector2(x, y);
    //
    // console.log(mouse);
    //
	// this.raycaster.setFromCamera( mouse, this.camera );
    // var intersects = this.raycaster.intersectObjects([this.bodyGroup], true);
    // console.log(intersects.length);
    //
    //     //
	// 	// var intersects = _raycaster.intersectObjects( _objects );
    //     //
	// 	// if ( intersects.length > 0 ) {
    //     //
	// 	// 	_selected = intersects[ 0 ].object;
    //     //
	// 	// 	if ( _raycaster.ray.intersectPlane( _plane, _intersection ) ) {
    //     //
	// 	// 		_offset.copy( _intersection ).sub( _selected.position );
    //     //
	// 	// 	}
    //     //
	// 	// 	_domElement.style.cursor = 'move';
    //     //
	// 	// 	scope.dispatchEvent( { type: 'dragstart', object: _selected } );
    //     //
	// 	// }
};

PLThreeJS.prototype.onmousemove = function(e) {
    if (this.isDragging) {
        var rect = this.renderer.domElement.getBoundingClientRect();
        var x = (event.offsetX / rect.width) * 2 - 1;
        var y = - (event.offsetY / rect.height) * 2 + 1;
        var mouse = new THREE.Vector2(x, y);
        console.log(mouse);
        // need to cast a new ray...
        this.raycaster.setFromCamera( mouse, this.camera );
        if (this.raycaster.ray.intersectPlane(this.translatePlane, this.translateIntersection)) {
            console.log('intersection...');
            var p = this.translateIntersection.clone();
            console.log(p);
            console.log(this.translateOffset);
            p.sub(this.translateOffset);
            console.log(p);
            // console.log(this.bodyGroup.position);
            // var p = this.translateIntersection.sub(this.translateOffset);
            // console.log(p);
            // console.log(typeof(p));
            this.bodyGroup.position.copy(this.translateIntersection.sub(this.translateOffset));
            console.log(this.translateIntersection.sub(this.translateOffset));
            console.log(this.bodyGroup.position);
            console.log('...done');
        } else {
            console.log('no intersection?');
        }
        this.render();


        // var deltaMove = {
        //     x: e.offsetX-this.previousMousePosition.x,
        //     y: e.offsetY-this.previousMousePosition.y,
        // };
        //
        // // Orientation of camera
        // var qCamera = this.camera.quaternion.clone();
        // // Rotation to be applied by mouse motion (in camera frame)
        // var qMotion = new THREE.Quaternion()
        //     .setFromEuler(new THREE.Euler(
        //         deltaMove.y * (Math.PI / 180),
        //         deltaMove.x * (Math.PI / 180),
        //         0,
        //         'XYZ'
        //     ));
        // // Rotation to be applied by mouse motion (in world frame) - note that
        // // ".inverse()" modifies qCamera in place, so the order here matters
        // qMotion.multiplyQuaternions(qCamera, qMotion);
        // qMotion.multiplyQuaternions(qMotion, qCamera.inverse());
        // // New orientation of object
        // this.bodyGroup.quaternion.multiplyQuaternions(qMotion, this.bodyGroup.quaternion);
        // // Render and update hidden input element
        // this.render();
        //
        // this.previousMousePosition = {
        //     x: e.offsetX,
        //     y: e.offsetY,
        // };
    }

    // if (!this.controls.enabled && this.bodyCanMove) {
    //     var deltaMove = {
    //         x: e.offsetX-this.previousMousePosition.x,
    //         y: e.offsetY-this.previousMousePosition.y,
    //     };
    //
    //     if(this.isDragging) {
    //         // Orientation of camera
    //         var qCamera = this.camera.quaternion.clone();
    //         // Rotation to be applied by mouse motion (in camera frame)
    //         var qMotion = new THREE.Quaternion()
    //             .setFromEuler(new THREE.Euler(
    //                 deltaMove.y * (Math.PI / 180),
    //                 deltaMove.x * (Math.PI / 180),
    //                 0,
    //                 'XYZ'
    //             ));
    //         // Rotation to be applied by mouse motion (in world frame) - note that
    //         // ".inverse()" modifies qCamera in place, so the order here matters
    //         qMotion.multiplyQuaternions(qCamera, qMotion);
    //         qMotion.multiplyQuaternions(qMotion, qCamera.inverse());
    //         // New orientation of object
    //         this.bodyGroup.quaternion.multiplyQuaternions(qMotion, this.bodyGroup.quaternion);
    //         // Render and update hidden input element
    //         this.render();
    //     }
    //
    //     this.previousMousePosition = {
    //         x: e.offsetX,
    //         y: e.offsetY,
    //     };
    // }
};

PLThreeJS.prototype.onmouseup = function() {
    if (this.isDragging) {
        this.isDragging = false;
        this.controls.enabled = this.cameraCanMove;
    }

    // if (!this.controls.enabled && this.bodyCanMove) {
    //     if (this.isDragging) {
    //         this.isDragging = false;
    //     }
    // }
};

PLThreeJS.prototype.updateHiddenInput = function() {

    var val = {
        body_quaternion: this.bodyGroup.quaternion.toArray(),
        body_position: this.bodyGroup.position.toArray(),
        camera_quaternion: this.camera.quaternion.toArray(),
        camera_position: this.camera.position.toArray(),
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
            s += '[ ';
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

    if (this.textPoseFormat == 'matrix') {
        var R = this.bodyGroup.matrix.elements;
        this.matlabText.text(rotToMatlab(R));
        this.pythonText.text(rotToPython(R));
    } else if (this.textPoseFormat == 'quaternion') {
        var q = this.bodyGroup.quaternion.toArray();
        this.matlabText.text(quatToMatlab(q));
        this.pythonText.text(quatToPython(q));
    }
};
