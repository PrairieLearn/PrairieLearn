#include <stdio.h>
using namespace std;

extern int factorial(int n);

int main() {
    bool success = true;
    if (factorial(0) != 1) {
      printf("Factorial of 0 is 1 not %d\n", factorial(0));
      success = false;
    };
    if (factorial(1) != 1) {
      printf("Factorial of 1 is 1 not %d\n", factorial(1));
      success = false;
    };
    if (factorial(2) != 2) {
      printf("Factorial of 2 is 2 not %d\n", factorial(2));
      success = false;
    };
    if (factorial(5) != 120) {
      printf("Factorial of 5 is 120 not %d\n", factorial(5));
      success = false;
    };
    if (factorial(10) != 3628800) {
      printf("Factorial of 10 is 3628800 not %d\n", factorial(10));
      success = false;
    };
    if (success) {
      printf("SUCCESS\n");
      return 0;
    }
    return 1;
}
