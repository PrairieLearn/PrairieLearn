/**
 * Re-creates script elements within a container so the browser executes them.
 * This is necessary because scripts inserted via `innerHTML` are not executed
 * by the browser.
 */
export function executeScripts(container: Element) {
  container.querySelectorAll('script').forEach((oldScript) => {
    const newScript = document.createElement('script');
    Array.from(oldScript.attributes).forEach((attr) => {
      newScript.setAttribute(attr.name, attr.value);
    });
    newScript.textContent = oldScript.textContent;
    oldScript.replaceWith(newScript);
  });
}
