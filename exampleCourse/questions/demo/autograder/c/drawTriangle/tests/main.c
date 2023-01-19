#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <sys/types.h>
#include <sys/stat.h>
#include <fcntl.h>

extern void drawTri(int, int, int);

FILE *realStdout;
FILE *forImage;

void drawLine(int x_start, int y_start, int x_end, int y_end) {

  if (x_start < x_end || (x_start == x_end && y_start < y_end))
    fprintf(realStdout, "(%d,%d)-(%d,%d)\n", x_start, y_start, x_end, y_end);
  else
    fprintf(realStdout, "(%d,%d)-(%d,%d)\n", x_end, y_end, x_start, y_start);
  fprintf(forImage, ",%d,%d,%d,%d", x_start, y_start, x_end, y_end);
}

int main(void) {
  
  /* Using the scanf as interface to accept testcases from py */
  int l, x, y;

  /* Saves stdout in a new file descriptor */
  int realStdoutNo = dup(STDOUT_FILENO);
  realStdout = fdopen(realStdoutNo, "w");

  /* Switches stdout/stderr to point to different file descriptor to
   * avoid students passing code by printing the correct result. */
  int devNull = open("/dev/null", O_WRONLY);
  dup2(devNull, STDOUT_FILENO);
  dup2(devNull, STDERR_FILENO);

  forImage = fopen("image.json", "w");
  fprintf(forImage, "[0");
  
  scanf("%d %d %d", &l, &x, &y);
  drawTri(l, x, y);
  fprintf(forImage, "]");
  fclose(forImage);
  return 0;
}
