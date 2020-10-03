#include <stdio.h>
#include <stdlib.h>

extern int square(int x);

int main(int argc, char *argv[]) {

  for (int i = 1; i < argc; i++) {
    printf("%+d\n", square(atoi(argv[i])));
  }
  return 0;
}
