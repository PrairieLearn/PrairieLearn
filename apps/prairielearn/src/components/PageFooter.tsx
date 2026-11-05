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
          <div className="col-6 d-flex justify-content-end">
            <a
              href="https://prairielearn.com"
              className="text-decoration-none me-3 page-footer-text d-none d-md-inline"
              target="_blank"
              rel="noreferrer"
            >
              Company
            </a>
            <a
              href="https://github.com/PrairieLearn/PrairieLearn"
              className="text-decoration-none page-footer-text"
              target="_blank"
              rel="noreferrer"
            >
              <i className="fab fa-github" /> <span>GitHub</span>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
