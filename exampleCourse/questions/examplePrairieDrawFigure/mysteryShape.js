    // A convenient shorthand for expressing vectors
    var $V = Sylvester.Vector.create;
	
    // This establishes a grid for drawing with the given dimensions
    // The origin is located at the center of this grid
    this.pd.setUnits(15,9);
    
    // This fetches the variables passed in through param-names
    // For convenience, we assign these to script variables
    var shapeName = this.params.get("shapeName");
    var dimension = this.params.get("dimension");
    
    // Create a point at the origin; this will be the center of our shape
    var O = $V([0,0]);
    
    // The shapeName will be "circle", "ellipse", "square", or "rectangle"
    if (shapeName == "circle") {
        // Use dimension as the radius of the circle
        this.pd.circle(O, dimension);
       
    } else if (shapeName == "square") {
        // Use dimension as the square side length
        this.pd.rectangle(dimension, dimension);
        
    } else { // shapeName == "rectangle"
        // Use dimension as height, and 2*dimension as width
        this.pd.rectangle(2*dimension, dimension);
    }
    
        
 