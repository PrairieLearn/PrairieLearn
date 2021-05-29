#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <sys/types.h>
#include <sys/stat.h>
#include <fcntl.h>

extern int square(int x);

int main(int argc, char *argv[]) {
  
  int n;

  /* Saves stdout in a new file descriptor */
  int realStdoutNo = dup(STDOUT_FILENO);
  FILE *realStdout = fdopen(realStdoutNo, "w");

  /* Switches stdout/stderr to point to different file descriptor to
   * avoid students passing code by printing the correct result. */
  int devNull = open("/dev/null", O_WRONLY);
  dup2(devNull, STDOUT_FILENO);
  dup2(devNull, STDERR_FILENO);
  
  scanf("%d", &n);
  fprintf(realStdout, "[%d]\n", square(n));
  
  return 0;
}
