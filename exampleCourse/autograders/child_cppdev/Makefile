CXX = clang++
LD = clang++

CXXFLAGS = -std=c++1y -stdlib=libc++ -c -g -O0 -Wall -Wextra -Werror -pedantic 
LDFLAGS = -std=c++1y -stdlib=libc++ -lpng -lc++abi -lpthread

EXENAME = tester

all: tester


tester: q1.o
	$(LD) $(LDFLAGS) main.cpp q1.o -o $(EXENAME)

q1.o: q1.cpp q1.h
	$(CXX) $(CXXFLAGS) q1.cpp

clean:
	rm *.o tester
