module.exports = function (req, res, next) {
  // We use the pl_requested_data_changed cookie to detect when we
  // have attempted to change the effective user (or other emulation
  // data). This cookie is set in pages/partials/navbar.ejs and
  // pages/instructorEffectiveUser.
  //
  // We use this cookie in
  // middlewares/redirectEffectiveAccessDenied.js to catch authz
  // errors and attempt a redirect to an accessible page. This
  // middleware simply sets res.locals.pl_requested_data_changed for
  // later access and clears the cookie, so we will only trigger the
  // redirect once.
  //
  // Using a cookie also means that if someone tries to access an
  // unauthorized page for some reason other than emulating, they
  // will receive an error page as expected.

  if (req.cookies.pl_requested_data_changed) {
    res.clearCookie('pl_requested_data_changed');
    res.locals.pl_requested_data_changed = true;
  }
  next();
};
