import { assetPath } from '../lib/assets.js';

export function PageFooter() {
  return (
    <footer className="footer py-3 bg-light border-top">
      <div className="container">
        <div className="row align-items-center">
          <div className="col-6">
            <a
              href="https://prairielearn.com"
              className="text-decoration-none me-3 page-footer-text"
              aria-label="Company"
              target="_blank"
              rel="noreferrer"
            >
              <img
                src={assetPath('images/prairielearn-logo.png')}
                alt="PrairieLearn"
                width="2139"
                height="403"
                style={{ width: '160px', maxWidth: '100%', height: 'auto' }}
              />
            </a>
          </div>
          <div className="col-6 d-flex flex-wrap align-items-center justify-content-end gap-3">
            <a
              href="https://github.com/PrairieLearn/PrairieLearn"
              className="text-decoration-none text-nowrap page-footer-text"
              aria-label="GitHub"
              target="_blank"
              rel="noreferrer"
            >
              <i className="fab fa-github" aria-hidden="true" />
            </a>
            <a
              href="https://www.linkedin.com/company/prairielearn/"
              className="text-decoration-none text-nowrap page-footer-text"
              aria-label="LinkedIn"
              target="_blank"
              rel="noreferrer"
            >
              <i className="fab fa-linkedin" aria-hidden="true" />
            </a>
            <a
              href="https://www.instagram.com/prairielearn/"
              className="text-decoration-none text-nowrap page-footer-text"
              aria-label="Instagram"
              target="_blank"
              rel="noreferrer"
            >
              <i className="fab fa-instagram" aria-hidden="true" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
