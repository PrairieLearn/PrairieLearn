import org.json.simple.JSONArray;
import org.json.simple.JSONObject;
import org.junit.runner.Description;
import org.junit.runner.JUnitCore;
import org.junit.runner.Result;
import org.junit.runner.notification.Failure;
import org.junit.runner.notification.RunListener;

import javax.tools.JavaCompiler;
import javax.tools.StandardJavaFileManager;
import javax.tools.ToolProvider;
import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.io.StringWriter;
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

    private Collection<File> studentFiles = new HashSet<>();
    private Collection<File> testFiles = new HashSet<>();
    private Collection<String> testClasses = new HashSet<>();

    public JUnitAutograder() {
        this.compiler = ToolProvider.getSystemJavaCompiler();
        this.jUnitCore = new JUnitCore();
        jUnitCore.addListener(this);
    }

    public static void main(String args[]) {

        JUnitAutograder autograder = new JUnitAutograder();

        try {
            autograder.findStudentFiles(baseDirectoryForStudentCode);
            autograder.findTestFiles(baseDirectoryForTests, "");

            autograder.compileFiles(autograder.studentFiles, "Compilation errors, please fix and try again.",
                    "Compilation warnings:");
            autograder.compileFiles(autograder.testFiles,
                    "Error compiling test files. This typically means your class does not match the specified signature.",
                    null);
            autograder.runTests();

        } catch (UngradableException e) {
            autograder.gradable = false;
        } finally {
            autograder.saveResults();
        }
    }

    private void findStudentFiles(File directory) throws UngradableException {

        StringWriter out = new StringWriter();

        for (File fileEntry : directory.listFiles()) {
            if (fileEntry.isDirectory())
                this.findStudentFiles(fileEntry);
            else if (fileEntry.getName().endsWith(".java")) {
                System.out.println("Student class found: " + fileEntry.getName());
                this.studentFiles.add(fileEntry);
            }
        }
    }

    public void findTestFiles(File directory, String classBaseName) throws UngradableException {

        for (File fileEntry : directory.listFiles()) {
            if (fileEntry.isDirectory())
                this.findTestFiles(fileEntry, classBaseName + fileEntry.getName() + ".");
            else if (fileEntry.getName().endsWith(".java")) {
                System.out.println("Test found: " + fileEntry.getName());
                testFiles.add(fileEntry);
                testClasses.add(classBaseName + fileEntry.getName().substring(0, fileEntry.getName().length() - 5));
            }
        }
    }

    /* With help from:
     * https://stackoverflow.com/questions/2946338/how-do-i-programmatically-compile-and-instantiate-a-java-class
     * https://stackoverflow.com/questions/55496833/getting-list-of-all-tests-junit-tests
     */
    private void compileFiles(Iterable<File> files, String messageIfError, String messageIfWarning) throws UngradableException {

        StringWriter out = new StringWriter();
        StandardJavaFileManager fileManager = compiler.getStandardFileManager(null, null, null);

        boolean result = this.compiler.getTask(out, null, null,
                Arrays.asList(new String[]{"-Xlint", "-d", baseDirectoryForStudentCode.getAbsolutePath()}),
                null,
                fileManager.getJavaFileObjectsFromFiles(files)).call();

        if (!result) {
            System.out.println("Compilation error");
            this.message = messageIfError + "\n\n" + out.toString() + "\n";
            throw new UngradableException();
        } else if (messageIfWarning != null && !"".equals(out.toString())) {
            System.out.println("Compilation warning");
            this.message = messageIfWarning + "\n\n" + out.toString() + "\n";
        }
    }

    public void runTests() throws UngradableException {

        for (String className : testClasses) {
            try {
                Class<?> cls = Class.forName(className, true, Thread.currentThread().getContextClassLoader());
                this.jUnitCore.run(cls);
            } catch (ClassNotFoundException e) {
                this.points = 0;
                this.message = "Could not load test class " + className;
                throw new UngradableException();
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

    private class UngradableException extends Exception {
    }
}
