import org.json.simple.JSONArray;
import org.json.simple.JSONObject;
import org.junit.platform.engine.TestExecutionResult;
import org.junit.platform.engine.TestTag;
import org.junit.platform.engine.support.descriptor.MethodSource;
import org.junit.platform.launcher.Launcher;
import org.junit.platform.launcher.LauncherDiscoveryRequest;
import org.junit.platform.launcher.TestExecutionListener;
import org.junit.platform.launcher.TestIdentifier;
import org.junit.platform.launcher.core.LauncherDiscoveryRequestBuilder;
import org.junit.platform.launcher.core.LauncherFactory;

import org.prairielearn.autograder.AutograderInfo;

import javax.tools.JavaCompiler;
import javax.tools.StandardJavaFileManager;
import javax.tools.ToolProvider;
import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.io.StringWriter;
import java.util.*;

import static org.junit.platform.engine.discovery.DiscoverySelectors.selectClass;

public class JUnitAutograder implements TestExecutionListener {

    private static final File baseDirectoryForStudentCode = new File("/grade/student");
    private static final File baseDirectoryForTests = new File("/grade/tests/junit");

    private final JavaCompiler compiler;
    private final Launcher launcher;

    private double points = 0, maxPoints = 0;
    private String output = "", message = "";
    private boolean gradable = true;
    private List<AutograderTest> tests = new ArrayList<>();

    private Collection<File> studentFiles = new HashSet<>();
    private Collection<File> testFiles = new HashSet<>();
    private Collection<String> testClasses = new HashSet<>();

    public JUnitAutograder() {
        this.compiler = ToolProvider.getSystemJavaCompiler();
        launcher = LauncherFactory.create();
        launcher.registerTestExecutionListeners(this);
    }

    public static void main(String args[]) {

        JUnitAutograder autograder = new JUnitAutograder();

        try {
            autograder.findStudentFiles(baseDirectoryForStudentCode);
            autograder.findTestFiles(baseDirectoryForTests, "");

            autograder.compileFiles(autograder.studentFiles, true,
                    "Compilation errors, please fix and try again.",
                    "Compilation warnings:");
            autograder.compileFiles(autograder.testFiles, false,
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
                testClasses.add(classBaseName + fileEntry.getName().substring(0, fileEntry.getName().lastIndexOf('.')));
            }
        }
    }

    /* With help from:
     * https://stackoverflow.com/questions/2946338/how-do-i-programmatically-compile-and-instantiate-a-java-class
     * https://stackoverflow.com/questions/55496833/getting-list-of-all-tests-junit-tests
     */
    private void compileFiles(Iterable<File> files, boolean listError, String messageIfError, String messageIfWarning) throws UngradableException {

        StringWriter out = new StringWriter();
        StandardJavaFileManager fileManager = compiler.getStandardFileManager(null, null, null);

        boolean result = this.compiler.getTask(out, null, null,
                Arrays.asList(new String[]{"-Xlint", "-d", baseDirectoryForStudentCode.getAbsolutePath()}),
                null,
                fileManager.getJavaFileObjectsFromFiles(files)).call();

        if (!result) {
            System.out.println("Compilation error:");
            System.out.println(out.toString());
            this.message += messageIfError + (listError ? "\n\n" + out.toString() : "") + "\n";
            throw new UngradableException();
        } else if (!"".equals(out.toString())) {
            System.out.println("Compilation warning:");
            System.out.println(out.toString());
            if (listError)
                this.message += messageIfWarning + "\n\n" + out.toString() + "\n";
        }
    }

    public void runTests() throws UngradableException {

        LauncherDiscoveryRequestBuilder requestBuilder = LauncherDiscoveryRequestBuilder.request();

        for (String className : testClasses) {
            try {
                Class<?> cls = Class.forName(className, true, Thread.currentThread().getContextClassLoader());
                LauncherDiscoveryRequest request = LauncherDiscoveryRequestBuilder.request().selectors(selectClass(cls)).build();
                this.launcher.execute(request);
            } catch (ClassNotFoundException e) {
                this.points = 0;
                this.message = "Could not load test class " + className;
                throw new UngradableException();
            }
        }
    }

    @Override
    public synchronized void executionFinished(TestIdentifier test, TestExecutionResult result) {
        if (!test.isTest()) return;
        AutograderTest autograderTest = new AutograderTest(test.getDisplayName());

        for (TestTag tag : test.getTags()) {
            if (tag.getName().startsWith("points=")) {
                try {
                    autograderTest.maxPoints = autograderTest.points = Double.parseDouble(tag.getName().substring(7));
                } catch(NumberFormatException exception) {
                    this.output = "Could not parse points tag: " + tag.getName();
                    this.gradable = false;
                }
            }
        }

        // For compatibility with JUnit4 autograder
        test.getSource().ifPresent(source -> {
            if (source instanceof MethodSource) {
                AutograderInfo info = ((MethodSource) source).getJavaMethod().getAnnotation(AutograderInfo.class);
                if (info != null) {
                    if (info.points() > 0)
                        autograderTest.points = autograderTest.maxPoints = info.points();
                    if (!"".equals(info.name()))
                        autograderTest.name = info.name();
                    if (!"".equals(info.description()))
                        autograderTest.description = info.description();
                }
            }
        });

        if (!result.getStatus().equals(TestExecutionResult.Status.SUCCESSFUL)) {
            autograderTest.points = 0;
            result.getThrowable().ifPresent(t -> autograderTest.message = t.getMessage());
            if (autograderTest.message == null)
                autograderTest.message = "";
        }

        this.tests.add(autograderTest);
        this.points += autograderTest.points;
        this.maxPoints += autograderTest.maxPoints;
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

    private class AutograderTest implements Comparable<AutograderTest> {

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

        public int compareTo(AutograderTest other) {
            return this.name.compareTo(other.name);
        }
    }

    private class UngradableException extends Exception {
    }
}
