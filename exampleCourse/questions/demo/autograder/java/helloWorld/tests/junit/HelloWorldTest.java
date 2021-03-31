import static org.junit.Assert.*;

import java.io.PrintStream;
import java.io.ByteArrayOutputStream;
import java.util.regex.Pattern;
import java.util.regex.Matcher;

import org.prairielearn.autograder.AutograderInfo;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;

public class HelloWorldTest {

    private PrintStream originalOut;
    private PrintStream originalErr;
    private ByteArrayOutputStream newOut;
    
    @Before
    public void changeOutErr() {
        this.originalOut = System.out;
        this.originalErr = System.err;

        this.newOut = new ByteArrayOutputStream();
        PrintStream newOut = new PrintStream(this.newOut);
        System.setOut(newOut);
        System.setErr(newOut);
    }

    @After
    public void restoreOutErr() {
        System.out.close();
        System.setOut(this.originalOut);
        System.setErr(this.originalErr);
    }

    @Test
    @AutograderInfo(name="Check program output")
    public void checkProgramOutput() throws Exception {
        HelloWorld.main(new String[]{});
        
        String output = this.newOut.toString().toLowerCase();
        Pattern p = Pattern.compile("hello[ ,]*world");
        Matcher m = p.matcher(output);

        assertTrue("The program must output 'Hello World'.\nYour program printed '" + output.trim() + "'.\nMake sure you check for spelling.\nHINT: Copy the expected output from the question and paste it on your program.", m.find());
    }
}
