import org.json.simple.JSONArray;
import org.json.simple.JSONObject;
import org.json.simple.parser.JSONParser;
import org.junit.platform.engine.DiscoverySelector;
import org.junit.platform.engine.TestExecutionResult;
import org.junit.platform.engine.TestTag;
import org.junit.platform.engine.reporting.ReportEntry;
import org.junit.platform.engine.support.descriptor.ClassSource;
import org.junit.platform.engine.support.descriptor.MethodSource;
import org.junit.platform.launcher.Launcher;
import org.junit.platform.launcher.LauncherDiscoveryRequest;
import org.junit.platform.launcher.TestExecutionListener;
import org.junit.platform.launcher.TestIdentifier;
import org.junit.platform.launcher.TestPlan;
import org.junit.platform.launcher.core.LauncherDiscoveryRequestBuilder;
import org.junit.platform.launcher.core.LauncherFactory;

import org.prairielearn.autograder.AutograderInfo;

import java.io.File;
import java.io.FileWriter;
import java.io.FileReader;
import java.io.IOException;
import java.io.Reader;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.platform.engine.discovery.DiscoverySelectors.selectClass;

public class JUnitAutograder implements TestExecutionListener {

    private final Launcher launcher;
    // Uses a LinkedHashMap with access-order. This ensures that the
    // order of the tests retrieved at the end is based on last access
    // (i.e., when the `executionFinished()` method is called), to
    // preserve test order where this is relevant.
    private final Map<TestIdentifier, AutograderTest> tests = new LinkedHashMap<>(100, 0.75f, false);
    private final Map<TestIdentifier, Double> classTotals = new HashMap<>();
    private double points = 0;
    private String output = "";
    private String message = "";
    private boolean gradable = true;
    private TestPlan testPlan = null;
    private String resultsFile;
    private String[] testClasses;

    public JUnitAutograder() {
        launcher = LauncherFactory.create();
        launcher.registerTestExecutionListeners(this);
    }

    public static void main(final String[] args) {

        File paramsFile = new File("/grade/params/params.json");
        JSONObject paramsObject = null;
        try (Reader reader = new FileReader(paramsFile)) {
            JSONParser paramsParser = new JSONParser();
            paramsObject = (JSONObject) paramsParser.parse(reader);
        } catch (Exception e) {
            e.printStackTrace();
        } finally {
            //noinspection ResultOfMethodCallIgnored
            paramsFile.delete();
        }
        if (paramsObject == null) {
            System.err.println("Error parsing the parameter object.");
            System.exit(0);
        }
        if (paramsFile.exists()) {
            System.err.println("Error deleting the parameter file.");
            System.exit(0);
        }

        JUnitAutograder autograder = new JUnitAutograder();
        autograder.resultsFile = (String) paramsObject.get("results_file");
        autograder.testClasses = ((String) paramsObject.get("test_files")).split("\\s");
        String compilationWarnings = (String) paramsObject.get("compile_output");
        if (compilationWarnings != null && !"".equals(compilationWarnings)) {
            autograder.message = "Compilation warnings:\n\n" + compilationWarnings;
        }

        try {
            autograder.runTests();
        } catch (UngradableException e) {
            autograder.gradable = false;
        } finally {
            autograder.saveResults((String) paramsObject.get("signature"));
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

        /*
         * The launch of the tests is done after all classes are
         * selected, to ensure that a single TestPlan is created, and
         * if one of the tests causes the launcher to crash, the tests
         * for all files are recorded.
         */
        LauncherDiscoveryRequestBuilder requestBuilder = LauncherDiscoveryRequestBuilder.request();
        LauncherDiscoveryRequest request = requestBuilder.selectors(selectorList).build();
        this.launcher.execute(request);
    }

    private synchronized void addProvisionalTest(final TestIdentifier test) {
        if (test.getSource().map(s -> s instanceof ClassSource).orElse(false)) {
            this.classTotals.putIfAbsent(test, 0.0);
        }
        if (test.isTest()) {
            AutograderTest autograderTest = new AutograderTest(test);
            tests.put(test, autograderTest);
            TestIdentifier parent = testPlan.getParent(test).orElse(null);
            while (parent != null && !parent.getSource().map(s -> s instanceof ClassSource).orElse(false)) {
                parent = testPlan.getParent(parent).orElse(null);
            }
            this.classTotals.put(parent, this.classTotals.getOrDefault(parent, 0.0) + autograderTest.maxPoints);
        }
    }

    @Override
    public synchronized void testPlanExecutionStarted(final TestPlan plan) {
        /*
         * Provisional autograder tests are created before the entire
         * plan completes. This is done so that, if a major crash
         * (e.g., OutOfMemoryError) causes the tests to be unable to
         * call `executionFinished`, that the default tests still
         * exist and are saved to the JSON file as expected. This
         * doesn't catch dynamic tests, though.
         */
        this.testPlan = plan;
        for (TestIdentifier root : plan.getRoots()) {
            addProvisionalTest(root);
            for (TestIdentifier test : plan.getDescendants(root)) {
                addProvisionalTest(test);
            }
        }
    }

    @Override
    public synchronized void dynamicTestRegistered(final TestIdentifier test) {
        addProvisionalTest(test);
    }

    @Override
    public synchronized void reportingEntryPublished(final TestIdentifier test, final ReportEntry entry) {

        if (!test.isTest()) {
            return;
        }

        AutograderTest autograderTest = tests.get(test);
        if (autograderTest == null) {
            return;
        }

        StringBuilder newOutput = new StringBuilder(autograderTest.output);
        for (Map.Entry<String, String> pair : entry.getKeyValuePairs().entrySet()) {
            // "value" is the key used by TestReporter if only a value is provided (without a key)
            // https://junit.org/junit5/docs/5.9.1/api/org.junit.jupiter.api/org/junit/jupiter/api/TestReporter.html#publishEntry(java.lang.String)
            if (pair.getKey().equals("value")) {
                newOutput.append(pair.getValue()).append("\n");
            } else {
                newOutput.append(pair.getKey()).append(": ").append(pair.getValue()).append("\n");
            }
        }
        autograderTest.output = newOutput.toString();
    }

    @Override
    public synchronized void executionFinished(final TestIdentifier test, final TestExecutionResult result) {

        if (!test.isTest()) {
            if (!result.getStatus().equals(TestExecutionResult.Status.SUCCESSFUL)) {
                this.points = 0;
                this.gradable = false;
                this.message = "A test factory or value source failed to produce tests. Consult your instructor.";
                result.getThrowable().ifPresent(Throwable::printStackTrace);
            }
            return;
        }
        AutograderTest autograderTest = tests.get(test);
        if (autograderTest == null) {
            // This shouldn't happen
            this.points = 0;
            this.message = "Unable to parse the results. Test execution completed for a test that was not part of the test plan. Consult your instructor.";
            this.output = test.toString();
            this.gradable = false;
            return;
        }

        autograderTest.points = autograderTest.maxPoints;
        autograderTest.message = "";
        if (!result.getStatus().equals(TestExecutionResult.Status.SUCCESSFUL)) {
            autograderTest.points = 0;
            result.getThrowable().ifPresent(t -> autograderTest.message = t.toString());
            if (autograderTest.message == null) {
                autograderTest.message = "";
            }
        }

        this.points += autograderTest.points;
    }

    @SuppressWarnings("unchecked")
    private void saveResults(final String signature) {

        double maxPoints = this.classTotals.entrySet().stream().mapToDouble(e -> {
            if (e.getKey() != null) {
                for (TestTag tag : e.getKey().getTags()) {
                    if (tag.getName().startsWith("maxpoints=")) {
                        try {
                            return Double.parseDouble(tag.getName().substring(10));
                        } catch (NumberFormatException exception) {
                            JUnitAutograder.this.output = "Could not parse maxpoints tag: " + tag.getName();
                            JUnitAutograder.this.gradable = false;
                        }
                    }
                }
            }
            return e.getValue();
        }).sum();
        double testMaxPoints = this.tests.values().stream().mapToDouble(t -> t.maxPoints).sum();

        JSONArray resultsTests = new JSONArray();
        for (AutograderTest test : this.tests.values()) {
            resultsTests.add(test.toJson());
        }

        if (maxPoints - testMaxPoints > 0.01) {
            resultsTests.add(new AutograderTest("Incomplete tests", maxPoints - testMaxPoints,
                    """
                            The number of points achieved by the autograder tests was not enough to reach\s
                            the full amount of tests required for full marks. This is typically caused by\s
                            failing early tests, or by an early autograder crash.""")
                    .toJson());
        }

        JSONObject results = new JSONObject();
        results.put("score", maxPoints > 0 ? Math.min(this.points / maxPoints, 1) : 0);
        results.put("points", Math.min(this.points, maxPoints));
        results.put("max_points", maxPoints);
        results.put("output", this.output);
        results.put("message", this.message);
        results.put("gradable", this.gradable);
        results.put("tests", resultsTests);
        results.put("signature", signature);

        try (FileWriter writer = new FileWriter(this.resultsFile)) {
            writer.write(results.toString());
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    private static final class UngradableException extends Exception {
    }

    private final class AutograderTest implements Comparable<AutograderTest> {

        private String name;
        private String description = "";
        // Default message, will typically be overridden when the execution completes
        private String message = "This test was not executed because the autograder crashed before \nthe results could be obtained";
        private String output = "";
        private double points = 0;
        private double maxPoints = 1;

        private AutograderTest(final String name, final double maxPoints, final String message) {
            this.name = name;
            this.maxPoints = maxPoints;
            this.message = message;
        }

        private AutograderTest(final TestIdentifier test) {
            this.name = test.getDisplayName();

            for (TestTag tag : test.getTags()) {
                if (tag.getName().startsWith("points=")) {
                    try {
                        this.maxPoints = Double.parseDouble(tag.getName().substring(7));
                    } catch (NumberFormatException exception) {
                        JUnitAutograder.this.output = "Could not parse points tag: " + tag.getName();
                        JUnitAutograder.this.gradable = false;
                    }
                }
            }

            // For compatibility with JUnit4 autograder
            test.getSource().ifPresent(source -> {
                if (source instanceof MethodSource) {
                    AutograderInfo info = ((MethodSource) source).getJavaMethod().getAnnotation(AutograderInfo.class);
                    if (info != null) {
                        if (info.points() > 0) {
                            this.maxPoints = info.points();
                        }
                        if (!"".equals(info.name())) {
                            this.name = info.name();
                        }
                        if (!"".equals(info.description())) {
                            this.description = info.description();
                        }
                    }
                }
            });
        }

        @SuppressWarnings("unchecked")
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

        public int compareTo(final AutograderTest other) {
            return this.name.compareTo(other.name);
        }
    }
}
