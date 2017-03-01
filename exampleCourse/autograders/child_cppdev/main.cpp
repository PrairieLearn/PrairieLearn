#include "q1.h"
#include <cstdio>

// highly advanced autograder using our proprietary JSON library
int main(int argc, char* argv[])
{
    printf("{\n");

    printf("\"testingCompleted\" : \"true\",");
    printf("tests: [\n");

    printf("{ \"name\": \"test 1\", \"id\": 1, \"points\": \"%d\", \"maxpoints\": 10 },", (p1() == 1 ? 10 : 0));
    printf("{ \"name\": \"test 2\", \"id\": 2, \"points\": \"%d\", \"maxpoints\": 10},", (p2() == 2 ? 10 : 0));
    printf("{ \"name\": \"test 3\", \"id\": 3, \"points\": \"%d\", \"maxpoints\": 10},", (p3() == 3 ? 10 : 0));

    printf("],\n");

    printf("\"output\": \"All testing completed!\"");

    printf("}\n");
}

