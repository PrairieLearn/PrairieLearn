import org.json.simple.JSONArray;
import org.json.simple.JSONObject;
import org.junit.runner.Description;
import org.junit.runner.JUnitCore;
import org.junit.runner.Result;
import org.junit.runner.notification.Failure;
import org.junit.runner.notification.RunListener;

import javax.tools.JavaCompiler;
import javax.tools.ToolProvider;
import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.lang.reflect.InvocationTargetException;
import java.net.MalformedURLException;
import java.net.URL;
import java.net.URLClassLoader;
import java.util.*;

public class JUnitAutograder extends RunListener {

    private static final File baseDirectoryForStudentCode = new File("/grade/student");
    private static final File baseDirectoryForTests = new File("/grade/tests/junit");

    private final JavaCompiler compiler;
    private final JUnitCore jUnitCore;

    private double points = 0, maxPoints = 0;
    private String output = "", message = "";
    private boolean gradable = true;
    private List<AutograderTest> tests = new ArrayList<>();
    private Map<Description, AutograderTest> testMap = new HashMap<>();

    public JUnitAutograder() {
        this.compiler = ToolProvider.getSystemJavaCompiler();
        this.jUnitCore = new JUnitCore();
        jUnitCore.addListener(this);
    }

    public static void main(String args[]) {

        JUnitAutograder autograder = new JUnitAutograder();

        autograder.compileStudentFiles(baseDirectoryForStudentCode);
        autograder.testFilesInDirectory(baseDirectoryForTests, "");
        autograder.saveResults();
    }

    private void compileStudentFiles(File directory) {

        for (File fileEntry : directory.listFiles()) {
            if (fileEntry.isDirectory())
                this.compileStudentFiles(fileEntry);
            else if (fileEntry.getName().endsWith(".java")) {
                System.out.println("Student class found: " + fileEntry.getName());
                this.compiler.run(null, null, null,
                        "-d", baseDirectoryForStudentCode.getAbsolutePath(),
                        fileEntry.getAbsolutePath());
            }
        }
    }

    /* With help from:
     * https://stackoverflow.com/questions/2946338/how-do-i-programmatically-compile-and-instantiate-a-java-class
     * https://stackoverflow.com/questions/55496833/getting-list-of-all-tests-junit-tests
     */
    public void testFilesInDirectory(File directory, String classBaseName) {

        for (File fileEntry : directory.listFiles()) {
            if (fileEntry.isDirectory())
                this.testFilesInDirectory(fileEntry, classBaseName + fileEntry.getName() + ".");
            else if (fileEntry.getName().endsWith(".java")) {
                System.out.println("Test found: " + fileEntry.getName());
                String className = classBaseName + fileEntry.getName().substring(0, fileEntry.getName().length() - 5);
                this.compiler.run(null, null, null,
                        "-d", baseDirectoryForTests.getAbsolutePath(),
                        fileEntry.getAbsolutePath());
                try {
                    Class<?> cls = Class.forName(className, true, Thread.currentThread().getContextClassLoader());
                    this.jUnitCore.run(cls);
                } catch (ClassNotFoundException e) {
                    AutograderTest test = new AutograderTest(className);
                    test.points = 0;
                    test.message = "Could not load test class " + className;
                    tests.add(test);
                }
            }
        }
    }

    @Override
    public void testStarted(Description description) throws Exception {
        AutograderTest test = new AutograderTest(description.getMethodName());
//        AutograderInfo info = description.getAnnotation(AutograderInfo.class);
//        if (info != null) {
//            if (info.points() > 0)
//                test.points = test.maxPoints = info.points();
//            if (!"".equals(info.name()))
//                test.name = info.name();
//            if (!"".equals(info.description()))
//                test.name = info.description();
//        }
        testMap.put(description, test);
    }

    @Override
    public synchronized void testFinished(Description description) throws Exception {
        AutograderTest test = testMap.get(description);
        if (test != null) {
            this.tests.add(test);
            this.points += test.points;
            this.maxPoints += test.maxPoints;
        }
    }

    @Override
    public void testFailure(Failure failure) throws Exception {
        System.out.println("Test " + failure.getDescription() + " failed");
        AutograderTest test = testMap.get(failure.getDescription());
        if (test != null) {
            test.points = 0;
            test.output = failure.getTrace();
        }
    }


    private void saveResults() {

        JSONArray resultsTests = new JSONArray();
        for (AutograderTest test : this.tests)
            resultsTests.add(test.toJson());

        JSONObject results = new JSONObject();
        results.put("score", this.maxPoints > 0 ? this.points / this.maxPoints : 0);
        results.put("points", this.points);
        results.put("max_points", this.maxPoints);
        results.put("output", this.output);
        results.put("message", this.message);
        results.put("gradable", this.gradable);
        results.put("tests", resultsTests);

        new File("/grade/results").mkdirs();
        try (FileWriter writer = new FileWriter("/grade/results/results.json")) {
            System.out.println(results.toString());
            writer.write(results.toString());
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    private class AutograderTest {

        private String name;
        private String description = "";
        private String message = "";
        private String output = "";
        private double points = 1;
        private double maxPoints = 1;

        private AutograderTest(String name) {
            this.name = name;
        }

        public JSONObject toJson() {
            JSONObject object = new JSONObject();
            object.put("name", this.name);
            object.put("description", this.description);
            object.put("points", this.points);
            object.put("max_points", this.maxPoints);
            object.put("output", this.output);
            object.put("message", this.message);
            return object;
        }
    }
}
