/*
 * Draws a right-angled, isosceles triangle on the screen
 *    where:  (i) the length of the equal/shorter sides
 * (i.e., not the hypotenuse), and (ii) the (x, y) location
 * of the upper vertex are passed as parameters.
 */
void drawTri(int side_length, int x, int y)
{
    /*
     * We know that if we can find the coordinates of the 3 vertices,
     * then we can use the drawLine function to draw the triangle.
     * The coordinates of the first vertex are given as parameters of
     * the function. The coordinates of the other two vertices need to
     * be computed.
     */
    int v1x = x;
    int v1y = y;
    int v2x = v1x;
    int v2y = v1y - side_length;
    int v3x = v2x + side_length;
    int v3y = v2y;

    // call drawLine to draw the triangle on the screen
    drawLine(v1x, v1y, v2x, v2y);
    drawLine(v2x, v2y, v3x, v3y);
    drawLine(v3x, v3y, v1x, v1y);
}