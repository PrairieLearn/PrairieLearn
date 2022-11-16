import org.json.simple.JSONArray;
import org.json.simple.JSONObject;
import org.junit.platform.engine.DiscoverySelector;
import org.junit.platform.engine.TestExecutionResult;
import org.junit.platform.engine.TestTag;
import org.junit.platform.engine.support.descriptor.MethodSource;
import org.junit.platform.launcher.Launcher;
import org.junit.platform.launcher.LauncherDiscoveryRequest;
import org.junit.platform.launcher.TestExecutionListener;
import org.junit.platform.launcher.TestIdentifier;
import org.junit.platform.launcher.TestPlan;
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

    private final Launcher launcher;

    private double points = 0, maxPoints = 0;
    private String output = "", message = "";
    private boolean gradable = true;
    private Map<TestIdentifier, AutograderTest> tests = new LinkedHashMap<>();

    private String resultsFile;
    private String[] testClasses;

    public JUnitAutograder() {
        launcher = LauncherFactory.create();
        launcher.registerTestExecutionListeners(this);
    }

    public static void main(String args[]) {

        JUnitAutograder autograder = new JUnitAutograder();
        autograder.resultsFile = args[0];
        autograder.testClasses = args[1].split("\\s");
        if (!"".equals(args[2]))
            autograder.message = "Compilation warnings:\n\n" + args[2];

        try {
            autograder.runTests();
        } catch (UngradableException e) {
            autograder.gradable = false;
        } finally {
            autograder.saveResults();
            // Force exit to ensure any pending threads don't cause the autograder to hang
            System.exit(0);
        }
    }

    public void runTests() throws UngradableException {

        List<DiscoverySelector> selectorList = new ArrayList<>();

        for (String classSrcName : testClasses) {
            String className = classSrcName
                .replaceFirst("^/grade/tests/junit/", "")
                .replaceFirst("\\.java$", "")
                .replaceAll("/", ".");
            System.out.println("Test class: " + className + " (from " + classSrcName + ")");
            try {
                Class<?> cls = Class.forName(className, true, Thread.currentThread().getContextClassLoader());
                selectorList.add(selectClass(cls));
            } catch (ClassNotFoundException e) {
                this.points = 0;
                this.message = "Could not load test class " + className;
                throw new UngradableException();
            }
        }

        /* The launch of the tests is done after all classes are
         * selected, to ensure that a single TestPlan is created, and
         * if one of the tests causes the launcher to crash, the tests
         * for all files are recorded. */
        LauncherDiscoveryRequestBuilder requestBuilder = LauncherDiscoveryRequestBuilder.request();
        LauncherDiscoveryRequest request = requestBuilder.selectors(selectorList).build();
        this.launcher.execute(request);
    }

    @Override
    public synchronized void testPlanExecutionStarted(TestPlan plan) {
        /* Provisional autograder tests are created before the entire
         * plan completes. This is done so that, if a major crash
         * (e.g., OutOfMemoryError) causes the tests to be unable to
         * call `executionFinished`, that the default tests still
         * exist and are saved to the JSON file as expected. */
        for (TestIdentifier root : plan.getRoots()) {
            for (TestIdentifier test : plan.getDescendants(root)) {
                if (test.isTest()) {
                    AutograderTest autograderTest = new AutograderTest(test.getDisplayName());

                    for (TestTag tag : test.getTags()) {
                        if (tag.getName().startsWith("points=")) {
                            try {
                                autograderTest.maxPoints = Double.parseDouble(tag.getName().substring(7));
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
                                        autograderTest.maxPoints = info.points();
                                    if (!"".equals(info.name()))
                                        autograderTest.name = info.name();
                                    if (!"".equals(info.description()))
                                        autograderTest.description = info.description();
                                }
                            }
                        });

                    tests.put(test, autograderTest);
                    this.maxPoints += autograderTest.maxPoints;
                }
            }
        }
    }

    @Override
    public synchronized void executionFinished(TestIdentifier test, TestExecutionResult result) {

        if (!test.isTest()) return;
        AutograderTest autograderTest = tests.get(test);
        if (autograderTest == null) {
            // This shouldn't happen
            this.points = 0;
            this.message = "Unable to parse the results. Test execution completed for a test that was not part of the test plan. Consult your instructor.";
            throw new UngradableException();
        }

        autograderTest.points = autograderTest.maxPoints;
        autograderTest.message = "";
        if (!result.getStatus().equals(TestExecutionResult.Status.SUCCESSFUL)) {
            autograderTest.points = 0;
            result.getThrowable().ifPresent(t -> autograderTest.message = t.toString());
            if (autograderTest.message == null)
                autograderTest.message = "";
        }

        this.points += autograderTest.points;
    }

    private void saveResults() {

        JSONArray resultsTests = new JSONArray();
        for (AutograderTest test : this.tests.values())
            resultsTests.add(test.toJson());

        JSONObject results = new JSONObject();
        results.put("score", this.maxPoints > 0 ? this.points / this.maxPoints : 0);
        results.put("points", this.points);
        results.put("max_points", this.maxPoints);
        results.put("output", this.output);
        results.put("message", this.message);
        results.put("gradable", this.gradable);
        results.put("tests", resultsTests);

        try (FileWriter writer = new FileWriter(this.resultsFile)) {
            writer.write(results.toString());
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    private class AutograderTest implements Comparable<AutograderTest> {

        private String name;
        private String description = "";
        // Default message, will typically be overridden when the execution completes
        private String message = "This test was not executed because the autograder crashed before the results could be obtained";
        private String output = "";
        private double points = 0;
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

    private class UngradableException extends RuntimeException {
    }
}
