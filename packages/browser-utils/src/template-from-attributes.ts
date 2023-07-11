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
) {
  Object.entries(attributes).forEach(([sourceAttribute, targetSelector]) => {
    const attributeValue = source.getAttribute(sourceAttribute);
    if (attributeValue == null) {
      console.error(`Attribute "${sourceAttribute}" not found on source element`);
      return;
    }

    const targets = target.querySelectorAll(targetSelector);
    if (targets.length === 0) {
      console.error(`No elements found matching selector "${targetSelector}"`);
      return;
    }

    targets.forEach((targetElement) => {
      if (targetElement instanceof HTMLInputElement) {
        if (targetElement.type === 'checkbox') {
          const attributeParsed = JSON.parse(attributeValue);
          targetElement.checked = !!attributeParsed;
          // Manually trigger a 'change' event. This does not trigger
          // automatically when we change properties like 'checked'.
          targetElement.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          targetElement.value = attributeValue;
        }
      } else if (targetElement instanceof HTMLSelectElement) {
        const i = Array.from(targetElement.options).findIndex((o) => o.value === attributeValue);
        if (i >= 0) {
          targetElement.selectedIndex = i;
          // Manually trigger a 'change' event. This does not trigger
          // automatically when we change properties like 'checked'.
          targetElement.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          console.error(`Could not find option with value "${attributeValue}"`);
        }
      } else {
        targetElement.textContent = attributeValue;
      }
    });
  });
}
