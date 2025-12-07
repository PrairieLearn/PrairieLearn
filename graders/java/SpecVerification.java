import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.FileReader;
import java.io.FileWriter;
import java.io.IOException;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.SortedMap;
import java.util.TreeMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.json.simple.JSONObject;

public class SpecVerification {

    private static final Map<String, java.util.function.IntPredicate> nameToModifier = Map.ofEntries(
            Map.entry("public", Modifier::isPublic),
            Map.entry("private", Modifier::isPrivate),
            Map.entry("protected", Modifier::isProtected),
            Map.entry("static", Modifier::isStatic),
            Map.entry("final", Modifier::isFinal),
            Map.entry("abstract", Modifier::isAbstract),
            Map.entry("synchronized", Modifier::isSynchronized),
            Map.entry("volatile", Modifier::isVolatile),
            Map.entry("transient", Modifier::isTransient),
            Map.entry("native", Modifier::isNative),
            Map.entry("strictfp", Modifier::isStrict));
    private static final SortedMap<Integer, SpecContext> contextByIndentationLevel = new TreeMap<>();
    private static List<SpecContext> errors = new ArrayList<>();

    public static void main(String[] args) {

        File specFile = new File("/grade/tests/spec.txt");
        try (FileReader fileReader = new FileReader(specFile);
                BufferedReader specReader = new BufferedReader(fileReader)) {

            String specLine;
            int lineNumber = 0;

            while ((specLine = specReader.readLine()) != null) {
                lineNumber++;
                // Remove comments and trailing spaces
                specLine = specLine.split("#")[0].stripTrailing();
                // Ignore empty lines or lines with only comments
                if (specLine.trim().isEmpty())
                    continue;

                String trimmedSpec = specLine.stripLeading();
                int indentationLevel = specLine.length() - trimmedSpec.length();

                contextByIndentationLevel.entrySet().removeIf((entry) -> entry.getKey() >= indentationLevel);
                SpecContext parentContext = contextByIndentationLevel.isEmpty() ? null
                        : contextByIndentationLevel.lastEntry().getValue();
                // If the current context was invalid, don't validate specs under the same
                // context
                if (parentContext != null && parentContext.skipChildrenSpecs) {
                    continue;
                }

                String[] commands = trimmedSpec.split("[\\s]+", 2);

                SpecContext newContext = new SpecContext();
                newContext.lineNumber = lineNumber;
                newContext.contextType = commands[0].toLowerCase();
                String argument = commands.length > 1 ? commands[1] : "";
                switch (newContext.contextType) {
                    case "class":
                    case "interface":
                    case "enum":
                        evaluateClass(parentContext, newContext, argument);
                        break;
                    case "method":
                        evaluateMethod(parentContext, newContext, argument);
                        break;
                    default:
                        newContext.errors.add("Spec type " + newContext.contextType + " is invalid");
                }
                contextByIndentationLevel.put(indentationLevel, newContext);
                if (!newContext.errors.isEmpty())
                    errors.add(newContext);
            }

        } catch (FileNotFoundException exception) {
            // If the file does not exist, do nothing
            System.exit(0);
        } catch (IOException exception) {
            exception.printStackTrace();
            saveResults("Exception reading the specifications file. Contact your instructor.");
        } catch (Throwable exception) {
            exception.printStackTrace();
            saveResults("Unspecified error parsing specifications. Contact your instructor.");
        } finally {
            if (errors.isEmpty())
                System.exit(0);
            StringBuilder messageBuilder = new StringBuilder("Provided code did not match question specification:\n");
            for (SpecContext context : errors) {
                for (String error : context.errors) {
                    messageBuilder.append("- " + error + " (spec line " + context.lineNumber + ")\n");
                }
            }
            saveResults(messageBuilder.toString());
        }
    }

    private static void evaluateClass(SpecContext parentContext, SpecContext newContext, String argument) {

        String[] args = argument.split("[\\s]+");
        if (args.length < 1) {
            newContext.errors.add("Invalid syntax for class/interface/enum specification");
            newContext.skipChildrenSpecs = true;
            return;
        }
        String className = args[0];
        String errorPrefix = newContext.contextType + " '" + className + "'";
        if (parentContext == null) {
            try {
                newContext.specClass = Class.forName(className, false,
                        Thread.currentThread().getContextClassLoader());
            } catch (ClassNotFoundException e) {
                newContext.errors.add(errorPrefix + " does not exist");
                newContext.skipChildrenSpecs = true;
                return;
            }
        } else {
            // TODO Find subclass in class
        }

        if (newContext.specClass.isInterface()) {
            if (!newContext.contextType.equals("interface")) {
                newContext.errors.add(errorPrefix + " is an interface");
            }
        } else if (newContext.specClass.isEnum()) {
            if (!newContext.contextType.equals("enum")) {
                newContext.errors.add(errorPrefix + " is an enum");
            }
        } else {
            if (!newContext.contextType.equals("class")) {
                newContext.errors.add(errorPrefix + " is not an " + newContext.contextType);
            }
        }

        for (int idx = 1; idx < args.length; idx++) {
            String modifier = args[idx];
            if (nameToModifier.containsKey(modifier)) {
                if (!nameToModifier.get(modifier).test(newContext.specClass.getModifiers())) {
                    newContext.errors
                            .add(errorPrefix + " does not have expected modifier '" + modifier + "'");
                }
            } else if (modifier.equals("extends")) {
                String specSuperclass = args[++idx];
                String actualSuperclass = newContext.specClass.getSuperclass().getSimpleName();
                if (actualSuperclass.equals(specSuperclass)) {
                    newContext.errors.add(errorPrefix + " expected to extend " + specSuperclass
                            + ", instead it extends " + actualSuperclass);
                }
            } else if (modifier.equals("implements")) {
                // TODO Add support for implements
            } else {
                newContext.errors
                        .add("Specification for " + errorPrefix + " has unknown modifier '" + modifier + "'");
            }
        }
    }

    private static void evaluateMethod(SpecContext parentContext, SpecContext newContext, String argument) {
        if (parentContext.specClass == null) {
            newContext.errors.add("Method specification used in an invalid context");
            newContext.skipChildrenSpecs = true;
            return;
        }
        // Parse: method square(int) -> int static
        final Pattern argumentPattern = Pattern.compile("(\\w+)\\((.*)\\) -> (\\w+)(.*)");
        Matcher match = argumentPattern.matcher(argument);
        if (!match.find()) {
            newContext.errors.add("Invalid syntax for method specification");
            newContext.skipChildrenSpecs = true;
            return;
        }
        String methodName = match.group(1);
        String[] params = match.group(2).split(",");
        String returnType = match.group(3);
        String modifiers = match.group(4);

        Class<?>[] paramTypes = parseParams(params);
        Method method;
        try {
            method = newContext.specClass.getDeclaredMethod(methodName, paramTypes);
        } catch (NoSuchMethodException e) {
            newContext.errors.add("Method '" + methodName + "' not found with parameter types " + params);
            newContext.skipChildrenSpecs = true;
            return;
        }

        String actualReturnType = method.getReturnType().getSimpleName();
        if (!returnType.equals(actualReturnType)) {
            newContext.errors.add("Method '" + methodName + "' has incorrect return type, expected '" + returnType
                    + "', got '" + actualReturnType + "'");
        }
        // The static modifier, if absent, must indicate a non-static method
        if (!modifiers.contains("static") && Modifier.isStatic(method.getModifiers())) {
            newContext.errors.add("Method '" + methodName + "' should not be static");
        }

        for (String modifier : modifiers.split("[\\s]+")) {
            if (nameToModifier.containsKey(modifier)) {
                if (!nameToModifier.get(modifier).test(newContext.specClass.getModifiers())) {
                    newContext.errors
                            .add("Method '" + methodName + "' does not have expected modifier '" + modifier + "'");
                }
            } else {
                newContext.errors
                        .add("Specification for Method '" + methodName + "' has unknown modifier '" + modifier + "'");
            }
        }
    }

    @SuppressWarnings("unchecked")
    private static void saveResults(String message) {

        JSONObject results = new JSONObject();
        results.put("gradable", false);
        results.put("message", message);

        try (FileWriter writer = new FileWriter("/grade/results/results.json")) {
            writer.write(results.toString());
        } catch (IOException e) {
            e.printStackTrace();
        } finally {
            System.exit(1);
        }
    }

    private static class SpecContext {

        int lineNumber;
        String contextType;
        Class<?> specClass;
        boolean skipChildrenSpecs = false;
        List<String> errors = new ArrayList<>();
    }
}
