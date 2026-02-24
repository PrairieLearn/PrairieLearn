public class ReadFile {
    public static String readFirstLine(String fileName) {
        try (java.io.BufferedReader br = new java.io.BufferedReader(new java.io.FileReader(fileName))) {
            return br.readLine();
        } catch (java.io.IOException e) {
            e.printStackTrace();
            return null;
        }
    }
}
