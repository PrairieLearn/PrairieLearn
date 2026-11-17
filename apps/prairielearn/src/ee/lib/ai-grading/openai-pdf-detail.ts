const OPENAI_PDF_DETAIL = 'high';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPdfInputFile(value: Record<string, unknown>): boolean {
  if (value.type !== 'input_file') return false;

  const fileData = value.file_data;
  if (typeof fileData === 'string' && fileData.toLowerCase().startsWith('data:application/pdf')) {
    return true;
  }

  const filename = value.filename;
  return typeof filename === 'string' && filename.toLowerCase().endsWith('.pdf');
}

function setOpenAiPdfDetail(value: unknown): boolean {
  if (Array.isArray(value)) {
    let updated = false;
    for (const item of value) {
      if (setOpenAiPdfDetail(item)) updated = true;
    }
    return updated;
  }
  if (!isRecord(value)) return false;

  let updated = false;
  if (isPdfInputFile(value)) {
    value.detail = OPENAI_PDF_DETAIL;
    updated = true;
  }

  for (const child of Object.values(value)) {
    if (setOpenAiPdfDetail(child)) updated = true;
  }
  return updated;
}

/**
 * Adds high visual detail to PDF inputs after the AI SDK has converted them to OpenAI's format.
 * Remove this once the AI SDK OpenAI provider forwards a PDF detail option to input_file items.
 */
export function withOpenAiHighPdfDetail(fetchFunction: typeof fetch): typeof fetch {
  return async (input, init) => {
    if (typeof init?.body !== 'string') return fetchFunction(input, init);

    const body = JSON.parse(init.body) as unknown;
    if (!setOpenAiPdfDetail(body)) return fetchFunction(input, init);

    return fetchFunction(input, { ...init, body: JSON.stringify(body) });
  };
}
