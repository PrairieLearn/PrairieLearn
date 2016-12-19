
auth: auth.o hmac.o sha2.o
	gcc -o $@ $^

auth.o: auth.c
	gcc -c -o $@ $<

hmac.o: hmac/hmac_sha2.c hmac/hmac_sha2.h
	gcc -c -o $@ $<

sha2.o: hmac/sha2.c hmac/sha2.h
	gcc -c -o $@ $<

clean:
	rm -f auth auth.o hmac.o sha2.o
