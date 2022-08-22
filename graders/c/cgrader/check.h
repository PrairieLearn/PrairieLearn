#pragma once

#include </usr/include/check.h>

#include <stdlib.h>
#include <unistd.h>
#include <errno.h>

static inline void pl_fixture_sandbox_setup(void) {

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

  // Left blank as current version has no actionable items, but
  // available should new actions be created in the future
}

static inline TCase *pl_tcase_add_sandbox_fixtures(TCase *tc) {

  tcase_add_checked_fixture(tc, pl_fixture_sandbox_setup, pl_fixture_sandbox_teardown);
  return tc;
}

#define tcase_create(name) (pl_tcase_add_sandbox_fixtures(tcase_create(name)))
