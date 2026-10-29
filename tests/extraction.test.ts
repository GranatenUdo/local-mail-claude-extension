import test from 'node:test';
import assert from 'node:assert/strict';
import { ZipFile } from 'yazl';
import { extractBuffer } from '../src/extraction.js';
import { LIMITS } from '../src/security.js';

async function zip(files: Record<string, string>): Promise<Buffer> {
  const archive = new ZipFile(); const chunks: Buffer[] = [];
  const complete = new Promise<Buffer>((resolve, reject) => {
    archive.outputStream.on('data', c => chunks.push(c)); archive.outputStream.on('end', () => resolve(Buffer.concat(chunks))); archive.outputStream.on('error', reject);
  });
  for (const [name, content] of Object.entries(files)) archive.addBuffer(Buffer.from(content), name);
  archive.end(); return complete;
}
test('text, CSV, and JSON stay data and report truncation', async () => {
  for (const filename of ['test.txt', 'test.csv', 'test.json']) {
    const result = await extractBuffer(Buffer.from('hello data'), filename);
    assert.equal(result.text, 'hello data'); assert.equal(result.untrustedContent, true);
  }
  const long = await extractBuffer(Buffer.from('x'.repeat(100001)), 'test.txt');
  assert.equal(long.text.length, 100000); assert.equal(long.truncated, true);
});
test('DOCX paragraphs and table cells extract without external relationships', async () => {
  const file = await zip({ 'word/document.xml': '<w:document xmlns:w="test"><w:body><w:p><w:r><w:t>Hello</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Cell</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>',
    'word/_rels/document.xml.rels': '<Relationships><Relationship Target="https://example.invalid/secret" TargetMode="External"/></Relationships>' });
  const result = await extractBuffer(file, 'test.docx');
  assert.match(result.text, /Hello\s+Cell/);
});
test('XLSX returns sheet names and cached values without calculating formulas', async () => {
  const file = await zip({
    'xl/workbook.xml': '<workbook><sheets><sheet name="Budget" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="1"><c r="A1"><f>1+2</f><v>3</v></c><c r="B1" t="inlineStr"><is><t>Hi</t></is></c><c r="C1"><f>WEBSERVICE("https://example.invalid")</f></c></row></sheetData></worksheet>',
  });
  const result = await extractBuffer(file, 'test.xlsx');
  assert.match(result.text, /Budget/); assert.match(result.text, /A1\t3/); assert.match(result.text, /B1\tHi/);
  assert.match(result.text, /C1\t\[formula without cached value\]/);
  assert.equal(result.text.includes('WEBSERVICE'), false);
});
test('malformed, unsupported, oversized, entity-bearing and zip-bomb files are refused', async () => {
  await assert.rejects(extractBuffer(Buffer.from('bad'), 'test.docx'), /EXTRACTION/);
  await assert.rejects(extractBuffer(Buffer.from('bad'), 'test.exe'), /UNSUPPORTED/);
  await assert.rejects(extractBuffer(Buffer.alloc(LIMITS.extraction + 1), 'test.txt'), /TOO_LARGE/);
  const entities = await zip({ 'word/document.xml': '<!DOCTYPE x [<!ENTITY a "x">]><document>&a;</document>' });
  await assert.rejects(extractBuffer(entities, 'test.docx'), /EXTRACTION/);
  const bomb = await zip({ 'word/document.xml': 'x'.repeat(LIMITS.expanded + 1) });
  await assert.rejects(extractBuffer(bomb, 'test.docx'), /TOO_LARGE/);
});
export function syntheticPdf(text: string): Buffer {
  const stream = `BT /F1 12 Tf 10 50 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let output = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((object, i) => { offsets.push(Buffer.byteLength(output)); output += `${i+1} 0 obj\n${object}\nendobj\n`; });
  const start = Buffer.byteLength(output);
  output += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(o => `${String(o).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(output);
}
test('PDF text extraction works and empty/scanned PDF returns an actionable error', async () => {
  assert.match((await extractBuffer(syntheticPdf('Hello PDF'), 'test.pdf')).text, /Hello PDF/);
  await assert.rejects(extractBuffer(syntheticPdf(''), 'test.pdf'), /EXTRACTION/);
});
