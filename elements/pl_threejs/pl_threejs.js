// import * as OBJLoader from 'three-obj-loader';

// Constructor with property definitions
function PLThreeJS(uuid, options) {


    // Get the id of the div that contains everything
    var elementId = '#pl-threejs-' + uuid;
    this.element = $(elementId);
    if (!this.element.length) {
        throw new Error('pl-threejs-element ' + elementId + ' was not found!');
    }

    // Get the hidden input element to communicate from client to server
    this.inputElement = this.element.find('input');


    THREE.Object3D.DefaultUp.set(0, 0, 1);




    // Create scene

    this.aspectratio = 4/3;
    this.width = this.element.width();
    this.height = this.width/this.aspectratio;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera( 75, this.aspectratio, 0.1, 1000 );

    this.camera.position.x = 5;
    this.camera.position.y = 2;
    this.camera.position.z = 2;
    this.camera.up.set( 0, 0, 1 );
    this.camera.lookAt( this.scene.position );


    // var loader = new THREE.STLLoader();

    this.renderer = new THREE.WebGLRenderer( { alpha: true, antialias: true } );
    // this.renderer = new THREE.WebGLRenderer();
    // this.renderer.setClearColor( 0xffffff );


    this.renderer.setSize(this.width, this.height);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // anti-alias shadow

    // Use 'append' (a jQuery method) and not 'appendChild' (a DOM method)
    this.element.append(this.renderer.domElement);

    this.scene.add( new THREE.AmbientLight( 0xaaaaaa ));
    this.scene.add( this.makeLights() );

    

    this.screen = this.makeScreen();
    this.scene.add(this.screen);


    this.spaceFrame = this.makeFrame();
    this.bodyFrame = this.makeFrame();
    this.scene.add(this.spaceFrame);

    this.bodyObject = (function (){
        var geometry = new THREE.BoxGeometry( 1, 2, 3 );
        var material = new THREE.MeshStandardMaterial({
            color: 0xE84A27,
            transparent: true,
            opacity: 0.7
        });
        var mesh = new THREE.Mesh( geometry, material );
        mesh.castShadow = true;
        return mesh;
    })();

    this.bodyGroup = new THREE.Group();
    this.bodyGroup.add(this.bodyObject);
    this.bodyGroup.add(this.bodyFrame);
    this.scene.add(this.bodyGroup);


    this.isDragging = false;
    this.previousMousePosition = {
        x: 0,
        y: 0
    };

    // From array, from string, from b64
    this.bodyGroup.quaternion.fromArray(JSON.parse(atob(options.quaternion)));
    this.updateInputElement();

    // Enable mouse controls
    $(this.renderer.domElement).mousedown(PLThreeJS.prototype.onmousedown.bind(this));
    $(document).mousemove(PLThreeJS.prototype.onmousemove.bind(this));
    $(document).mouseup(PLThreeJS.prototype.onmouseup.bind(this));

    // Enable buttons
    $('#pl-threejs-button-objectvisible-' + uuid).click(PLThreeJS.prototype.toggleObjectVisible.bind(this));
    $('#pl-threejs-button-framevisible-' + uuid).click(PLThreeJS.prototype.toggleFrameVisible.bind(this));
    $('#pl-threejs-button-shadowvisible-' + uuid).click(PLThreeJS.prototype.toggleShadowVisible.bind(this));

    $('#pl-threejs-toggle-view-' + uuid).change(function() {console.log('toggle!')});



    this.animate();

    $(window).resize(PLThreeJS.prototype.onResize.bind(this));
};

PLThreeJS.prototype.toggleObjectVisible = function() {
    this.bodyObject.visible = !this.bodyObject.visible;
};

PLThreeJS.prototype.toggleFrameVisible = function() {
    this.bodyFrame.visible = !this.bodyFrame.visible;
    this.spaceFrame.visible = !this.spaceFrame.visible;
};

PLThreeJS.prototype.toggleShadowVisible = function() {
    this.screen.visible = !this.screen.visible;
};

PLThreeJS.prototype.onResize = function() {
    this.width = this.element.width();
    this.height = this.width/this.aspectratio;
    this.renderer.setSize(this.width, this.height);
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

        // var light = new THREE.DirectionalLight( 0xffffff, 0.5 );
        // light.castShadow = true;
        // part.add(light);

        // var finegrid = new THREE.GridHelper( 2, 10, 0xeeeeee, 0xeeeeee );
        // finegrid.position.set(0, 0, -5);
        // finegrid.quaternion.setFromEuler(new THREE.Euler(Math.PI/2, 0, 0, 'XYZ'));
        // finegrid.transparent = true;
        // finegrid.opacity = 0.1;
        // part.add(finegrid);

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
    console.log(this);
    this.scene.add( object );
};

PLThreeJS.prototype.onmousedown = function() {
    this.isDragging = true;
};

PLThreeJS.prototype.onmousemove = function(e) {
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
        // // Body axes have same orientation
        // this.bodyFrame.quaternion.copy(this.object.quaternion);
        // Update the value of the hidden input element to contain the new orientation
        this.updateInputElement();
    }

    this.previousMousePosition = {
        x: e.offsetX,
        y: e.offsetY
    };
};

PLThreeJS.prototype.onmouseup = function() {
    if (this.isDragging) {
        this.isDragging = false;
    }
};

PLThreeJS.prototype.animate = function() {
    requestAnimationFrame(PLThreeJS.prototype.animate.bind(this));
    this.renderer.render(this.scene, this.camera);
};

PLThreeJS.prototype.updateInputElement = function() {
    this.inputElement.val(btoa(JSON.stringify(this.bodyGroup.quaternion.toArray())));
};
