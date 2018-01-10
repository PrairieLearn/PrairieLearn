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


    // Create scene

    this.width = 400;
    this.height = 300;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera( 75, this.width/this.height, 0.1, 1000 );

    this.renderer = new THREE.WebGLRenderer();

    this.renderer.setSize(this.width, this.height);

    // Use 'append' (a jQuery method) and not 'appendChild' (a DOM method)
    this.element.append(this.renderer.domElement);

    this.geometry = new THREE.BoxGeometry( 1, 1, 1 );
    this.material = new THREE.MeshBasicMaterial( { color: 0x00ff00 } );
    this.cube = new THREE.Mesh( this.geometry, this.material );
    this.scene.add( this.cube );

    this.camera.position.z = 5;

    this.isDragging = false;
    this.previousMousePosition = {
        x: 0,
        y: 0
    };

    // From array, from string, from b64
    this.cube.quaternion.fromArray(JSON.parse(atob(options.quaternion)));

    this.updateInputElement();

    // Enable mouse controls
    $(this.renderer.domElement).mousedown(PLThreeJS.prototype.onmousedown.bind(this));
    $(document).mousemove(PLThreeJS.prototype.onmousemove.bind(this));
    $(document).mouseup(PLThreeJS.prototype.onmouseup.bind(this));

    this.animate();
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

        var deltaRotationQuaternion = new THREE.Quaternion()
            .setFromEuler(new THREE.Euler(
                deltaMove.y * (Math.PI / 180),
                deltaMove.x * (Math.PI / 180),
                0,
                'XYZ'
            ));

        this.cube.quaternion.multiplyQuaternions(deltaRotationQuaternion, this.cube.quaternion);

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
    this.inputElement.val(btoa(JSON.stringify(this.cube.quaternion.toArray())));
    // To array, to string, to b64.
    // this.inputElement.val(this.b64EncodeUnicode(JSON.stringify(this.cube.quaternion.toArray())));
    // this.inputElement.val(
    //     '[' + this.cube.quaternion.x +
    //     ',' + this.cube.quaternion.y +
    //     ',' + this.cube.quaternion.z +
    //     ',' + this.cube.quaternion.w + ']'
    // );
};

// PLThreeJS.prototype.b64DecodeUnicode = function(str) {
//     // Going backwards: from bytestream, to percent-encoding, to original string.
//     return decodeURIComponent(atob(str).split('').map(function(c) {
//         return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
//     }).join(''));
// };
//
// PLThreeJS.prototype.b64EncodeUnicode = function(str) {
//     // first we use encodeURIComponent to get percent-encoded UTF-8,
//     // then we convert the percent encodings into raw bytes which
//     // can be fed into btoa.
//     return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
//         function toSolidBytes(match, p1) {
//             return String.fromCharCode('0x' + p1);
//     }));
// };
