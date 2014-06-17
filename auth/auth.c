#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <time.h>
#include "hmac/hmac_sha2.h" // https://github.com/ouah/hmac

// extern char **environ;

#define ENV_UID "eppn"
#define ENV_NAME "displayName"

#define SHA256_HASH_SIZE 32
#define SECRET_KEY_FILE "/etc/prairielearn.key"
#define MAX_KEY_LEN 10000

char *iso8601Now() {
        time_t current_time;
        struct tm *time_data;
        char *time_string;

        if (!(time_string = malloc(26 * sizeof(char)))) {
                fprintf(stderr, "Error: unable to allocate time_string\n");
                exit(1);
        }
        current_time = time(NULL);
        time_data = localtime(&current_time);
        sprintf(time_string, "%04d-%02d-%02dT%02d:%02d:%02d%+03d:%02d",
                time_data->tm_year + 1900, time_data->tm_mon + 1, time_data->tm_mday,
                time_data->tm_hour, time_data->tm_min, time_data->tm_sec,
                time_data->tm_gmtoff / 3600, (abs(time_data->tm_gmtoff) % 3600) / 60);
        return time_string;
}

char *sha256Signature(char *uid, char *name, char *date, char *key) {
        size_t msg_size, sig_size, i;
        char *msg;
        char hash[SHA256_HASH_SIZE];
        char *sig;

        msg_size = strlen(uid) + strlen(name) + strlen(date) + 2;
        if (!(msg = malloc(msg_size * sizeof(char)))) {
                fprintf(stderr, "Error: unable to allocate msg\n");
                exit(1);
        }
        i = 0;
        strncpy(&msg[i], uid, strlen(uid));
        i += strlen(uid);
        msg[i++] = '/';
        strncpy(&msg[i], name, strlen(name));
        i += strlen(name);
        msg[i++] = '/';
        strncpy(&msg[i], date, strlen(date));

        hmac_sha256(key, strlen(key), msg, msg_size, hash, SHA256_HASH_SIZE);

        sig_size = 2 * SHA256_HASH_SIZE + 1;
        if (!(sig = malloc(sig_size * sizeof(char)))) {
                fprintf(stderr, "Error: unable to allocate sig\n");
                exit(1);
        }
        for (i = 0; i < SHA256_HASH_SIZE; i++) {
                sprintf(&sig[2 * i], "%02x", (unsigned char)hash[i]);
        }
        return sig;
}

void readkey(char *key) {
        FILE *keyfile;
        size_t keysize;
        
        if (!(keyfile = fopen(SECRET_KEY_FILE, "rb"))) {
                fprintf(stderr, "Error: unable to open key file: %s\n", SECRET_KEY_FILE);
                exit(1);
        }
        keysize = fread(key, sizeof(char), MAX_KEY_LEN, keyfile);
        if (!feof(keyfile)) {
                fprintf(stderr, "Error: key file too large: %s\n", SECRET_KEY_FILE);
                exit(1);
        }
        if (ferror(keyfile)) {
                fprintf(stderr, "Error: unable to read key from file: %s\n", SECRET_KEY_FILE);
                exit(1);
        }
        while (keysize > 1 && (key[keysize - 1] == '\n' || key[keysize - 1] == '\r'))
                keysize--;
        key[keysize] = 0;
}

int main() {
        char *uid, *name;
        char *time_string;
        char *signature;
        char key[MAX_KEY_LEN + 1];
        // char **env;

        readkey(key);
        if (!(uid = getenv(ENV_UID))) {
                fprintf(stderr, "Error: unable to get environment variable: %s\n", ENV_UID);
                exit(1);
        }
        if (!(name = getenv(ENV_NAME))) {
                fprintf(stderr, "Error: unable to get environment variable: %s\n", ENV_NAME);
                exit(1);
        }
        printf("Content-type: application/json\r\n\r\n");
        printf("{\n");
        printf("    \"uid\": \"%s\",\n", uid);
        printf("    \"name\": \"%s\",\n", name);
        time_string = iso8601Now();
        printf("    \"date\": \"%s\",\n", time_string);
        signature = sha256Signature(uid, name, time_string, key);
        printf("    \"signature\": \"%s\"\n", signature);
        printf("}\n");
        /*
        for (env = environ; *env; ++env) {
                printf("%s\r\n", *env);
        }
        */
        return 0;
}
