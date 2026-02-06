import static org.junit.Assert.*;

import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.Test;

public class ReadFileTest {

    @Test
    public void checkOriginalFile() throws Exception {
        // The file 'input.txt' is assumed to be present in the studentFiles directory for this test
        assertEquals("This is the first line.", ReadFile.readFirstLine("input.txt"));
    }

    @Test
    public void checkNonExistentFile() throws Exception {
        // Test that reading a non-existent file returns null
        assertNull(ReadFile.readFirstLine("non_existent_file.txt"));
    }

    @Test
    public void checkFileCreatedInTest() throws Exception {
        // Create a temporary file for testing
        Files.write(Path.of("newfile.txt"), "Temporary file first line.\nSecond line.".getBytes());

        try {
            assertEquals("Temporary file first line.", ReadFile.readFirstLine("newfile.txt"));
        } finally {
            // Clean up the temporary file
            Files.deleteIfExists(Path.of("newfile.txt"));
        }
    }
}
