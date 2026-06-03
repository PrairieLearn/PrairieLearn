import {
  BlobReader,
  BlobWriter,
  type FileEntry,
  TextReader,
  TextWriter,
  Uint8ArrayReader,
  Uint8ArrayWriter,
  ZipReader,
  ZipWriter,
} from '@zip.js/zip.js';

export interface ZipEntrySummary {
  name: string;
  compressedSize: number;
  uncompressedSize: number;
}

export interface ZipArchive {
  inputName: string;
  reader: ZipReader<unknown>;
  entries: ZipEntrySummary[];
  entryMap: Map<string, ZipEntrySummary>;
  entryFiles: Map<string, FileEntry>;
}

export type ZipInput = Blob | ArrayBuffer | ArrayBufferView;

export function normalizeZipPath(name: string): string | null {
  const normalized = name.replaceAll('\\', '/');
  if (
    normalized.startsWith('/') ||
    normalized.includes('\0') ||
    normalized.split('/').includes('..')
  ) {
    return null;
  }
  return normalized;
}

export function isDirectoryEntry(name: string): boolean {
  return name.endsWith('/');
}

export async function loadZipArchive(
  input: ZipInput,
  inputName = 'archive.zip',
): Promise<ZipArchive> {
  const reader = new ZipReader(toZipReader(input));
  const zipEntries = await reader.getEntries();
  const entries: ZipEntrySummary[] = [];
  const entryFiles = new Map<string, FileEntry>();

  for (const entry of zipEntries) {
    const name = normalizeZipPath(entry.filename);
    if (!name || entry.directory || isDirectoryEntry(name)) continue;

    entries.push({
      name,
      compressedSize: entry.compressedSize ?? 0,
      uncompressedSize: entry.uncompressedSize ?? 0,
    });
    entryFiles.set(name, entry as FileEntry);
  }

  entries.sort((a, b) => a.name.localeCompare(b.name));

  return {
    inputName,
    reader,
    entries,
    entryMap: new Map(entries.map((entry) => [entry.name, entry])),
    entryFiles,
  };
}

export function listZipEntries(archive: ZipArchive): ZipEntrySummary[] {
  return archive.entries;
}

export async function readZipEntryBuffer(
  archive: ZipArchive,
  entryName: string,
  maxBytes = 64 * 1024 * 1024,
): Promise<Uint8Array> {
  const entry = archive.entryFiles.get(entryName);
  if (!entry) throw new Error(`Entry not found: ${entryName}`);

  const size = archive.entryMap.get(entryName)?.uncompressedSize ?? 0;
  if (size > maxBytes) throw new Error(`Entry is too large to buffer: ${entryName}`);

  const data = await entry.getData(new Uint8ArrayWriter());
  if (data.byteLength > maxBytes) throw new Error(`Entry is too large to buffer: ${entryName}`);
  return data;
}

export async function readZipEntryText(
  archive: ZipArchive,
  entryName: string,
  maxBytes = 64 * 1024 * 1024,
): Promise<string> {
  const entry = archive.entryFiles.get(entryName);
  if (!entry) throw new Error(`Entry not found: ${entryName}`);

  const size = archive.entryMap.get(entryName)?.uncompressedSize ?? 0;
  if (size > maxBytes) throw new Error(`Entry is too large to buffer: ${entryName}`);

  const data = await entry.getData(new TextWriter());
  return data;
}

type ZipSource =
  | { name: string; text: string }
  | { name: string; buffer: Uint8Array }
  | { name: string; fromZip: { entry: string } };

export async function writeZipFromSources(
  archive: ZipArchive,
  sources: ZipSource[],
): Promise<Blob> {
  const writer = new ZipWriter(new BlobWriter('application/zip'));

  for (const source of sources) {
    if ('text' in source) {
      await writer.add(source.name, new TextReader(source.text));
    } else if ('buffer' in source) {
      await writer.add(source.name, new Uint8ArrayReader(source.buffer));
    } else {
      await writer.add(
        source.name,
        new Uint8ArrayReader(await readZipEntryBuffer(archive, source.fromZip.entry)),
      );
    }
  }

  return writer.close();
}

function toZipReader(input: ZipInput): BlobReader | Uint8ArrayReader {
  if (input instanceof Blob) return new BlobReader(input);
  if (input instanceof ArrayBuffer) return new Uint8ArrayReader(new Uint8Array(input));
  if (ArrayBuffer.isView(input)) {
    return new Uint8ArrayReader(new Uint8Array(input.buffer, input.byteOffset, input.byteLength));
  }
  throw new Error('Expected a File, Blob, ArrayBuffer, or Uint8Array archive.');
}
