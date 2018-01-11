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

    this.width = 400;
    this.height = 300;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera( 75, this.width/this.height, 0.1, 1000 );

    this.camera.position.x = 2;
    this.camera.position.y = -3;
    this.camera.position.z = 1;
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


    var geometry = new THREE.PlaneGeometry( 50, 50, 50 );
    var material = new THREE.ShadowMaterial( {color: 0x888888} );
    var plane = new THREE.Mesh( geometry, material );
    plane.receiveShadow = true;
    // plane.translateOnAxis( [0, 0, 1], 0 );
    plane.position.set( 0, 0, -5 );
    this.scene.add( plane );

    // var grid = new THREE.GridHelper( 5, 50 );
    // grid.setColors( 0xffffff, 0xffffff );
    // this.scene.add( grid );



    // var light = new THREE.AmbientLight( 0xffffff );
    // var light = new THREE.PointLight();
    var light = new THREE.DirectionalLight( 0xffffff, 0.5 );
    // light.position.set( 0, 0, 5 );
    light.castShadow = true;
    // light.shadowDarkness = 0.5;
    this.scene.add(light);
	// this.scene.add( new THREE.HemisphereLight( 0xffffbb, 0x080820, 1 ) );
    this.scene.add( new THREE.AmbientLight( 0xffffff ));

    // // White directional light at half intensity shining from the top.
    // var directionalLight = new THREE.DirectionalLight( 0xffffff, 0.5 );
    // this.scene.add( directionalLight );


    this.spaceFrame = new THREE.AxesHelper( 1 );
    this.bodyFrame = new THREE.AxesHelper( 1 );
    this.scene.add( this.spaceFrame );
    // this.scene.add( this.bodyFrame );

    this.geometry = new THREE.BoxGeometry( 1, 2, 3 );
    this.material = new THREE.MeshStandardMaterial(
        {
            color: 0xE84A27,
            transparent: true,
            opacity: 0.7
        });
    this.object = new THREE.Mesh( this.geometry, this.material );
    this.object.castShadow = true;
    this.object.add(this.bodyFrame);
    this.scene.add(this.object);
    this.bodyFrame.position.copy( this.object.position );
    this.bodyFrame.quaternion.copy( this.object.quaternion );




    this.isDragging = false;
    this.previousMousePosition = {
        x: 0,
        y: 0
    };

    // From array, from string, from b64
    this.object.quaternion.fromArray(JSON.parse(atob(options.quaternion)));

    this.updateInputElement();

    // Enable mouse controls
    $(this.renderer.domElement).mousedown(PLThreeJS.prototype.onmousedown.bind(this));
    $(document).mousemove(PLThreeJS.prototype.onmousemove.bind(this));
    $(document).mouseup(PLThreeJS.prototype.onmouseup.bind(this));

    this.animate();
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
        this.object.quaternion.multiplyQuaternions(qMotion, this.object.quaternion);
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
    this.inputElement.val(btoa(JSON.stringify(this.object.quaternion.toArray())));
};
