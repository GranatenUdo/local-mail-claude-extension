import path from 'node:path';
import yauzl from 'yauzl';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { boundedRead, LIMITS, MailError, textResult } from './security.js';

async function officeFiles(data: Buffer): Promise<Map<string, Buffer>> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(data, { lazyEntries: true, validateEntrySizes: true }, (error, zip) => {
      if (error || !zip) { reject(new MailError('EXTRACTION')); return; }
      const files = new Map<string, Buffer>(); let expanded = 0; let count = 0; let finished = false;
      const fail = (error: unknown) => { if (!finished) { finished = true; zip.close(); reject(error instanceof MailError ? error : new MailError('EXTRACTION')); } };
      zip.on('error', fail);
      zip.on('end', () => { if (!finished) { finished = true; resolve(files); } });
      zip.on('entry', entry => {
        if (++count > LIMITS.entries || expanded + entry.uncompressedSize > LIMITS.expanded) { fail(new MailError('TOO_LARGE')); return; }
        if ((entry.generalPurposeBitFlag & 1) || entry.fileName.split('/').includes('..') || files.has(entry.fileName)) { fail(new MailError('EXTRACTION')); return; }
        expanded += entry.uncompressedSize;
        if (/\/$/.test(entry.fileName)) { zip.readEntry(); return; }
        zip.openReadStream(entry, (error, stream) => {
          if (error || !stream) { fail(error); return; }
          boundedRead(stream, Math.min(entry.uncompressedSize, LIMITS.expanded)).then(content => {
            if (finished) return;
            if (content.length !== entry.uncompressedSize) { fail(new MailError('EXTRACTION')); return; }
            if (/\.xml$|\.rels$/.test(entry.fileName)) files.set(entry.fileName, content);
            zip.readEntry();
          }, fail);
        });
      });
      zip.readEntry();
    });
  });
}
function xml(data: Buffer | undefined, preserveOrder = false): any {
  if (!data) throw new MailError('EXTRACTION');
  const text = data.toString('utf8');
  if (/<!DOCTYPE|<!ENTITY/i.test(text) || XMLValidator.validate(text) !== true) throw new MailError('EXTRACTION');
  return new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', removeNSPrefix: true,
    parseTagValue: false, parseAttributeValue: false, processEntities: true, preserveOrder,
  }).parse(text);
}
function array<T>(value: T | T[] | undefined): T[] { return value === undefined ? [] : Array.isArray(value) ? value : [value]; }
function textNodes(value: any, depth = 0): string {
  if (depth > 100) throw new MailError('EXTRACTION');
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(v => textNodes(v, depth + 1)).join('');
  if (!value || typeof value !== 'object') return '';
  if (value['#text'] !== undefined) return String(value['#text']);
  return Object.entries(value).filter(([key]) => key === 't' || key === 'r' || key === 'is').map(([,v]) => textNodes(v, depth + 1)).join('');
}
function docxText(document: any): string {
  let result = '';
  function visit(nodes: any[], depth = 0) {
    if (depth > 100) throw new MailError('EXTRACTION');
    for (const node of nodes) {
      if (result.length > LIMITS.output) return;
      for (const [tag, children] of Object.entries(node)) {
        if (tag === 't') result += textNodes(children);
        else if (tag === 'tab') result += '\t';
        else if (tag === 'br') result += '\n';
        else if (Array.isArray(children)) visit(children, depth + 1);
        if (tag === 'p' || tag === 'tr') result += '\n';
        if (tag === 'tc') result += '\t';
      }
    }
  }
  visit(document); return result;
}
function xlsxText(files: Map<string, Buffer>) {
  const workbook = xml(files.get('xl/workbook.xml'));
  const relationships = array<any>(xml(files.get('xl/_rels/workbook.xml.rels')).Relationships?.Relationship);
  const strings = files.has('xl/sharedStrings.xml') ? array<any>(xml(files.get('xl/sharedStrings.xml')).sst?.si).map(s => textNodes(s)) : [];
  let output = ''; let cells = 0; let truncated = false;
  for (const sheet of array<any>(workbook.workbook?.sheets?.sheet)) {
    output += `Sheet: ${sheet.name}\n`;
    const relationship = relationships.find(r => r.Id === sheet.id);
    if (!relationship || relationship.TargetMode === 'External' || /[:\\]/.test(relationship.Target)) throw new MailError('EXTRACTION');
    const target = path.posix.normalize(relationship.Target.startsWith('/') ? relationship.Target.slice(1) : path.posix.join('xl', relationship.Target));
    if (!/^xl\/worksheets\/[^/]+\.xml$/.test(target)) throw new MailError('EXTRACTION');
    const worksheet = xml(files.get(target));
    for (const row of array<any>(worksheet.worksheet?.sheetData?.row)) {
      for (const cell of array<any>(row.c)) {
        if (cells++ >= LIMITS.cells || output.length > LIMITS.output) { truncated = true; break; }
        let value = cell.v ?? (cell.f !== undefined ? '[formula without cached value]' : '');
        if (cell.t === 's') value = strings[Number(cell.v)] ?? '';
        if (cell.t === 'inlineStr') value = textNodes(cell.is);
        output += `${String(cell.r || '').slice(0,30)}\t${String(value)}\n`;
      }
      if (truncated) break;
    }
    if (truncated) break;
  }
  return textResult(output, { truncated: truncated || output.length > LIMITS.output });
}
export async function extractBuffer(data: Buffer, filename: string) {
  if (data.length > LIMITS.extraction) throw new MailError('TOO_LARGE');
  try {
    const extension = path.extname(filename).toLowerCase();
    if (['.txt', '.csv', '.json'].includes(extension)) {
      let text = data.toString('utf8');
      if (data[0] === 0xff && data[1] === 0xfe) text = data.subarray(2).toString('utf16le');
      return textResult(text.replace(/^\uFEFF/, ''));
    }
    if (extension === '.docx' || extension === '.xlsx') {
      const files = await officeFiles(data);
      return extension === '.docx' ? textResult(docxText(xml(files.get('word/document.xml'), true))) : xlsxText(files);
    }
    if (extension === '.pdf') {
      const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const task = getDocument({ data: new Uint8Array(data), useSystemFonts: false,
        disableFontFace: true, useWasm: false, disableAutoFetch: true, verbosity: 0 });
      const pdf = await task.promise;
      let output = ''; let truncated = false;
      try {
        for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex++) {
          if (output.length > LIMITS.output || pageIndex > 1000) { truncated = true; break; }
          const page = await pdf.getPage(pageIndex);
          const content = await page.getTextContent();
          for (const item of content.items) if ('str' in item) output += item.str + (item.hasEOL ? '\n' : ' ');
          output += '\n'; page.cleanup();
        }
      } finally { await task.destroy(); }
      if (!output.trim()) throw new MailError('EXTRACTION');
      return textResult(output, { truncated: truncated || output.length > LIMITS.output });
    }
    throw new MailError('UNSUPPORTED');
  } catch (error) { if (error instanceof MailError) throw error; throw new MailError('EXTRACTION'); }
}
