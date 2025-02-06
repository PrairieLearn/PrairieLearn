import ace from 'ace-builds';

/**
 * ace loads modes/themes dynamically as needed, but its unable to identify
 * the base path implicitly when using compiled assets. We explicitly set the
 * base path for modes/themes here based on the meta tag set in the document,
 * which is computed server-side based on the asset path for the ace-builds
 * module.
 */
export function configureAceBasePaths() {
  const aceBasePath =
    document.querySelector('meta[name="ace-base-path"]')?.getAttribute('content') ?? null;

  ace.config.set('modePath', aceBasePath);
  ace.config.set('workerPath', aceBasePath);
  ace.config.set('themePath', aceBasePath);
}
