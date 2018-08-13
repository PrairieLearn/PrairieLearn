    // A convenient shorthand for expressing vectors
    var $V = Sylvester.Vector.create;
	
    // This establishes a grid for drawing with the given dimensions
    // The origin is located at the center of this grid
    this.pd.setUnits(20,12);
    
    // The next step is to store any parameters passed into local variables
    var title = this.params.get("title");
    
    // We shift the origin of the grid left and down
    this.pd.translate($V([-3,-4]));
    
    // Establish a set of useful points for drawing the shapes we want
    var O = $V([0,0]);
    var P = $V([0,8]);
    var Q = $V([6,8]);
    
    // These next commands create a pivot hinge and ground at point O
    // The point ground is directly below O and serves as the center of the
    // ground line
    var ground = O.subtract($V([0,0.7]));
    
    this.pd.ground(ground, $V([0,1]), 1);
    this.pd.pivot(ground, O, 0.6);
    // Notice we don't draw point O here -- we do it last so it appears on top
    // of the hinge/rod combination
    
    // Next we draw a straight link from O to Q
    // and an L shaped rod through P
    this.pd.rod(O, Q, 0.4);
    this.pd.LshapeRod(O, P, Q, 0.4);
    
    // Now we add some lines, arcs, and arrows for forces and dimensions
    // First, a distributed force on top of the L shaped rod
    // Notice the start point and end point are offset (to the top edge of the rod)
    this.pd.triangularDistributedLoad(P.add($V([0,0.2])), Q.add($V([0,0.2])), 1, 0.5, "1", "0.5", true, true);
    // Next, a point force acting upward at point Q
    this.pd.arrow(Q.subtract($V([0,2])), Q, "force");
    // A label at the midpoint of this force
    this.pd.labelLine(Q.subtract($V([0,2])), Q, $V([0,-1]), "F");
    
    // This line and arc are for the angle of the rod
    this.pd.line(O.add($V([1,0])), O.add($V([6,0])));
    this.pd.arc(O, 4, 0, 0.9);
    
    // We add points and labels last so they are on top of everything else
    this.pd.point(O);
    this.pd.text(O, $V([1,0]), "O");
    
    this.pd.point(P);
    this.pd.text(P, $V([1,-1]), "P");
    
    this.pd.point(Q);
    this.pd.text(Q, $V([-1,1]), "Q");
    
    // Use the param variable "title" to write text
    
    this.pd.text(O.add($V([1,-1])), $V([-1,1]), title);