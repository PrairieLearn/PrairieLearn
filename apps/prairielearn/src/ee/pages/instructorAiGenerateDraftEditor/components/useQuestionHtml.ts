import { useMutation } from '@tanstack/react-query';
import { parseAsString, useQueryState } from 'nuqs';
import { useCallback, useEffect, useRef } from 'react';

import { executeScripts } from '@prairielearn/browser-utils';

interface VariantResponse {
  questionContainerHtml: string;
  extraHeadersHtml: string;
  variantId: string;
}

interface PreviewRequest {
  /** `fetch` options; omitted for a plain GET that loads a fresh variant. */
  init?: RequestInit;
  /** User-facing message shown if the request fails. */
  errorMessage: string;
}

/** A failed preview refresh: the message to show, and `retry` replays the failed request. */
export interface QuestionPreviewError {
  message: string;
  retry: () => void;
}

function assertOkResponse(response: Response) {
  if (!response.ok) throw new Error(`Server returned status ${response.status}`);
}

function replaceQuestionContainer(wrapper: HTMLDivElement, htmlResponse: string) {
  const oldQuestionContainer = wrapper.querySelector('.question-container');
  if (!oldQuestionContainer) {
    throw new Error('No existing .question-container found');
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlResponse, 'text/html');
  const container = doc.querySelector<HTMLElement>('.question-container');

  if (!container) {
    throw new Error('No .question-container found in response');
  }

  oldQuestionContainer.replaceWith(container);

  executeScripts(container);
}

function copyAttributes(source: Element, target: Element) {
  Array.from(source.attributes).forEach((attr) => {
    target.setAttribute(attr.name, attr.value);
  });
}

function getCssAttributeSelectorValue(value: string) {
  if (typeof CSS !== 'undefined' && 'escape' in CSS) {
    return CSS.escape(value);
  }
  return value.replaceAll(/["\\[\]]/g, '\\$&');
}

async function syncQuestionAssets(extraHeadersHtml: string): Promise<void> {
  const trimmed = extraHeadersHtml.trim();
  if (!trimmed) return;

  const template = document.createElement('template');
  template.innerHTML = trimmed;

  const loadPromises: Promise<void>[] = [];

  template.content.childNodes.forEach((node) => {
    if (node instanceof HTMLLinkElement) {
      const href = node.getAttribute('href');
      if (!href || node.getAttribute('rel') !== 'stylesheet') return;

      const existing = document.head.querySelector<HTMLLinkElement>(
        `link[rel="stylesheet"][href="${getCssAttributeSelectorValue(href)}"]`,
      );

      if (existing) {
        existing.setAttribute('data-pl-question-asset', 'true');
        return;
      }

      const link = document.createElement('link');
      copyAttributes(node, link);
      link.setAttribute('data-pl-question-asset', 'true');
      document.head.append(link);
      return;
    }

    if (node instanceof HTMLScriptElement) {
      if (node.type === 'importmap') {
        const newText = node.textContent.trim();
        if (!newText) return;

        const existing =
          document.head.querySelector<HTMLScriptElement>(
            'script[type="importmap"][data-pl-question-importmap="true"]',
          ) ?? document.head.querySelector<HTMLScriptElement>('script[type="importmap"]');

        if (existing?.textContent.trim() === newText) {
          existing.setAttribute('data-pl-question-importmap', 'true');
          return;
        }

        const script = document.createElement('script');
        copyAttributes(node, script);
        script.textContent = node.textContent;
        script.setAttribute('data-pl-question-importmap', 'true');

        if (existing) {
          existing.replaceWith(script);
        } else {
          document.head.append(script);
        }
        return;
      }

      const src = node.getAttribute('src');
      if (!src) return;

      const existing = document.head.querySelector<HTMLScriptElement>(
        `script[src="${getCssAttributeSelectorValue(src)}"]`,
      );
      if (existing) {
        existing.setAttribute('data-pl-question-asset', 'true');
        return;
      }

      const script = document.createElement('script');
      copyAttributes(node, script);
      if (!node.hasAttribute('async') && !node.hasAttribute('defer')) {
        script.async = false;
      }
      script.setAttribute('data-pl-question-asset', 'true');
      const loadPromise = new Promise<void>((resolve) => {
        script.addEventListener('load', () => resolve());
        script.addEventListener('error', () => resolve());
      });
      document.head.append(script);
      loadPromises.push(loadPromise);
    }
  });

  if (loadPromises.length > 0) {
    await Promise.all(loadPromises);
  }
}

async function updateQuestionPreview(wrapper: HTMLDivElement, variantResponse: VariantResponse) {
  await syncQuestionAssets(variantResponse.extraHeadersHtml);
  replaceQuestionContainer(wrapper, variantResponse.questionContainerHtml);
}

function formDataToJson(
  formData: FormData,
): Partial<Record<string, FormDataEntryValue | FormDataEntryValue[]>> {
  const jsonData: Partial<Record<string, FormDataEntryValue | FormDataEntryValue[]>> = {};

  for (const [key, value] of formData.entries()) {
    const existing = jsonData[key];
    jsonData[key] =
      existing == null ? value : Array.isArray(existing) ? [...existing, value] : [existing, value];
  }

  return jsonData;
}

/**
 * Manages the question preview rendered as non-React markup: fetches new
 * variants, swaps the `.question-container`, and re-injects question assets
 * (stylesheets, scripts, importmaps) into the document head. Returns the
 * wrapper ref to attach to the preview container, a `newVariant` callback, and
 * `previewError` (which carries its own `retry`) plus `dismissPreviewError` for
 * surfacing and recovering from a failed refresh.
 */
export function useQuestionHtml({
  variantUrl,
  variantCsrfToken,
}: {
  variantUrl: string;
  variantCsrfToken: string;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Records the rendered variant in the URL so a reload restores it. nuqs keeps
  // this consistent with the `file` / `dir` / `tab` params and replaces (rather
  // than pushes) the history entry by default.
  const [, setVariantId] = useQueryState('variant_id', parseAsString);

  const previewMutation = useMutation({
    mutationFn: async ({ init }: PreviewRequest) => {
      const response = await fetch(variantUrl, init);
      assertOkResponse(response);
      const variantResponse = (await response.json()) as VariantResponse;
      if (wrapperRef.current) {
        await updateQuestionPreview(wrapperRef.current, variantResponse);
      }
      await setVariantId(variantResponse.variantId);
    },
    onError: (err, { errorMessage }) => {
      console.error(errorMessage, err);
    },
  });
  const { mutate: refreshPreview } = previewMutation;

  // The failed request stays on the mutation, so `retry` just replays it.
  const failedRequest = previewMutation.isError ? previewMutation.variables : undefined;
  const previewError: QuestionPreviewError | null = failedRequest
    ? { message: failedRequest.errorMessage, retry: () => refreshPreview(failedRequest) }
    : null;
  const dismissPreviewError = previewMutation.reset;

  const handleSubmit = useCallback(
    (e: Event) => {
      const target = e.target as HTMLElement;

      // Check if the event target is a form with class 'question-form'.
      // This is necessary because we're using event delegation.
      if (!(target instanceof HTMLFormElement) || !target.classList.contains('question-form')) {
        return;
      }

      e.preventDefault();

      const form = target;
      const submitEvent = e as SubmitEvent;
      const formData = new FormData(form);

      // Copy over the submitter's name/value if present. The submitter may be a
      // `<button>` or an `<input type="submit">`.
      const submitter = submitEvent.submitter;
      if (
        (submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement) &&
        submitter.name &&
        submitter.value
      ) {
        formData.append(submitter.name, submitter.value);
      }

      formData.set('__csrf_token', variantCsrfToken);

      refreshPreview({
        init: {
          method: form.method,
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(formDataToJson(formData)),
        },
        errorMessage: 'Failed to update the question preview.',
      });
    },
    [refreshPreview, variantCsrfToken],
  );

  const newVariant = useCallback(() => {
    refreshPreview({ errorMessage: 'Failed to load a new question variant.' });
  }, [refreshPreview]);

  const handleNewVariantButtonClick = useCallback(
    (e: Event) => {
      // Use `closest()` so clicks on elements nested inside the button still match.
      if (e.target instanceof HTMLElement && e.target.closest('.js-new-variant-button') != null) {
        e.preventDefault();
        newVariant();
      }
    },
    [newVariant],
  );

  // Attach delegated handlers to question markup rendered outside React.
  useEffect(() => {
    if (!wrapperRef.current) return;

    const wrapper = wrapperRef.current;
    wrapper.addEventListener('submit', handleSubmit, true);
    wrapper.addEventListener('click', handleNewVariantButtonClick, true);

    return () => {
      wrapper.removeEventListener('submit', handleSubmit, true);
      wrapper.removeEventListener('click', handleNewVariantButtonClick, true);
    };
  }, [handleSubmit, handleNewVariantButtonClick]);

  return { wrapperRef, newVariant, previewError, dismissPreviewError };
}
