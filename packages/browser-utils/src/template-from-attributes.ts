type AttributeMap = Record<string, string>;

/**
 * For each key in `attributes`, copies that attribute's value from `source`
 * into all elements within `target` that match the corresponding value in
 * `attributes`.
 *
 * For `<input type="checkbox">` elements it interprets the attribute as JSON
 * and uses the truthiness of it to set `checked`. For other `<input>` elements,
 * it sets the `value` attribute. For all others, it sets the `textContent`
 * attribute.
 *
 * @param source The element to copy attributes from
 * @param target The element to copy attributes into
 * @param attributes A map of attributes to copy from `source` to `target`
 * @param param.debug If true, logs debug information to the console
 */
export function templateFromAttributes(
  source: HTMLElement,
  target: HTMLElement,
  attributes: AttributeMap,
  { debug = false }: { debug?: boolean } = {},
) {
  function debugLog(...args: any[]): void {
    if (debug) {
      // eslint-disable-next-line no-console
      console.log(...args);
    }
  }

  Object.entries(attributes).forEach(([sourceAttribute, targetSelector]) => {
    debugLog('---------------------------------------------------------------------');
    debugLog('templateFromAttributes:');
    debugLog('source', source);
    debugLog('target', target);
    debugLog('sourceAttribute', sourceAttribute);
    debugLog('targetSelector', targetSelector);
    const attributeValue = source.getAttribute(sourceAttribute);
    if (attributeValue == null) {
      debugLog('attributeValue is undefined or null, skipping');
      return;
    }
    debugLog('attributeValue', attributeValue);

    const targets = target.querySelectorAll(targetSelector);
    if (targets.length === 0) {
      debugLog('targets.length == 0, skipping');
      return;
    }
    targets.forEach((targetElement) => {
      debugLog('targetElement', targetElement);
      if (targetElement instanceof HTMLInputElement) {
        if (targetElement.type === 'checkbox') {
          const attributeParsed = JSON.parse(attributeValue);
          debugLog(`targetElement is a checkbox, setting it to ${!!attributeParsed}`);
          targetElement.checked = !!attributeParsed;
          // Manually trigger a 'change' event. This does not trigger
          // automatically when we change properties like 'checked'.
          targetElement.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          debugLog(`targetElement is an input, setting it to "${attributeValue}"`);
          targetElement.value = attributeValue;
        }
      } else if (targetElement instanceof HTMLSelectElement) {
        debugLog(
          `targetElement is a select, finding the option with value "${attributeValue}" and setting it as selected`,
        );
        debugLog('targetElement.options', targetElement.options);
        const i = Array.from(targetElement.options).findIndex((o) => o.value === attributeValue);
        if (i >= 0) {
          debugLog(`found option at index ${i}, selecting it`);
          targetElement.selectedIndex = i;
          // Manually trigger a 'change' event. This does not trigger
          // automatically when we change properties like 'checked'.
          targetElement.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          debugLog(`could not find option with value "${attributeValue}"`);
        }
      } else {
        debugLog(
          `targetElement is not an input or select, setting textContent to "${attributeValue}"`,
        );
        targetElement.textContent = attributeValue;
      }
    });
  });
}
