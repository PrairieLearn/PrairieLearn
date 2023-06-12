import { encode, decode } from 'js-base64';
import { html, unsafeHtml, HtmlSafeString } from '@prairielearn/html';

/**
 * Use this function as an HTML component encode data that will be passed to the client.
 *
 * @param data The data to encode.
 * @param elementId The element ID to use for the encoded data.
 *
 */
export function EncodedData<T = unknown>(data: T, elementId: string): HtmlSafeString {
  const encodedData = unsafeHtml(encode(JSON.stringify(data)));
  return html`<script id="${elementId}" type="application/base64">
    ${encodedData}
  </script>`;
}

/**
 * Decode data that was passed to the client from in HTML component using EncodeData().
 *
 * @param elementId The element ID that stores the encoded data, from from EncodedData().
 * @returns The decoded data.
 */
export function decodeData<T = any>(elementId: string): T {
  const base64Data = document.getElementById(elementId)?.textContent;
  if (base64Data == null) {
    throw new Error(`No data found in element with ID "${elementId}"`);
  }
  const jsonData = decode(base64Data);
  const data = JSON.parse(jsonData);
  return data;
}
