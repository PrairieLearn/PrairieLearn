import org.prairielearn.autograder.AutograderInfo;

import static org.junit.Assert.*;
import org.junit.Test;

public class ExampleTest {

    @Test
    @AutograderInfo(points=1, name="1. Test with input 1")
    public void testWithInputOne() {

        assertEquals(1, Example.square(1));
    }

    @Test
    @AutograderInfo(points=1, name="2. Test with input 2")
    public void testWithInputTwo() {

        assertEquals(4, Example.square(2));
    }

    @Test
    @AutograderInfo(points=1, name="3. Test with input 10")
    public void testWithInputOneHundred() {

        assertEquals(100, Example.square(10));
    }

    @Test
    @AutograderInfo(points=1, name="4. Test with input -10")
    public void testWithNegativeInput() {

        assertEquals(100, Example.square(-10));
    }
}
