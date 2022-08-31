#pragma once

#ifndef _GNU_SOURCE
#define _GNU_SOURCE
#endif

#include </usr/include/check.h>

#include <stdlib.h>
#include <unistd.h>
#include <errno.h>
#include <sys/mman.h>

#define CORRECT_FINAL_CHECK 0xDEADBEEF

static long *plcheck_final_check = NULL;

static inline void pl_fixture_sandbox_setup(void) {

#ifndef PLCHECK_NO_EXTRA_FORK
  plcheck_final_check = mmap(NULL, sizeof(*plcheck_final_check), PROT_READ | PROT_WRITE, MAP_SHARED | MAP_ANONYMOUS, -1, 0);
  *plcheck_final_check = 1;

  // Fork before calling test, to control what kind of return is received back
  int child_pid = fork();
  if (child_pid < 0) {
    ck_abort_msg("Error attempting to set up sandboxed process for test. Contact your instructor.\n%s", strerror(errno));
  } else if (child_pid == 0) {
    // DO NOTHING
  } else {

    while (1) {
      int status, exit_status;
      int rv = waitpid(child_pid, &status, 0);

      if (rv != -1 && WIFEXITED(status)) {
        // If process exited before the teardown fixture, abort with a message
        if (!WEXITSTATUS(status) && (!plcheck_final_check || *plcheck_final_check != CORRECT_FINAL_CHECK))
          ck_abort_msg("Illegal attempt to call exit() or equivalent function in student code.");
        // If process exited normally, exit with the same exit code
        _exit(WEXITSTATUS(status));
      }

      // If process exited via a signal, raise the same signal, exiting as a precaution if the signal doesn't cause a termination
      if (rv != -1 && WIFSIGNALED(status)) {
        raise(WTERMSIG(status));
        _exit(255);
      }
    }
    _exit(255);
  }
#endif

#ifndef PLCHECK_KEEP_FD
  // Close all file descriptors from the test program, such as logs and result outputs (keep FD #3, used for error message piping)
  closefrom(4);
#endif
  
#ifndef PLCHECK_KEEP_UID
  // Set the user/group based on sandbox user and group set up by the test script
  char *uid = getenv("SANDBOX_UID"), *gid = getenv("SANDBOX_GID");
  if (gid) {
    int setgid_rv = setgid(atoi(gid));
    ck_assert_msg(!setgid_rv, "Error attempting to set up sandboxed group ID for test. Contact your instructor.\n%s", strerror(errno));
  }
  if (uid) {
    int setuid_rv = setuid(atoi(uid));
    ck_assert_msg(!setuid_rv, "Error attempting to set up sandboxed user ID for test. Contact your instructor.\n%s", strerror(errno));
  }
#endif

#ifndef PLCHECK_KEEP_ENV
  // Clear all environment variables, including those used to configure libcheck
  clearenv();
#endif
}

static inline void pl_fixture_sandbox_teardown(void) {

  *plcheck_final_check = CORRECT_FINAL_CHECK;
}

static inline TCase *pl_tcase_add_sandbox_fixtures(TCase *tc) {
  tcase_add_checked_fixture(tc, pl_fixture_sandbox_setup, pl_fixture_sandbox_teardown);
  return tc;
}

#define tcase_create(name) (pl_tcase_add_sandbox_fixtures(tcase_create(name)))
