import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Real temporary documents: removing target/fragment checks must fail these tests.
async function fixture(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(path.join(tmpdir(), 'local-mail-docs-'));
  try {
    await mkdir(path.join(root, 'docs'));
    await writeFile(path.join(root, 'docs', 'Some page.md'), '# Same\n\n## Same\n\n## **Formatted** `code`\n');
    await writeFile(path.join(root, 'LICENSE'), 'synthetic license');
    await run(root);
  } finally { await rm(root, { recursive: true, force: true }); }
}
async function check(root: string, markdown: string) {
  await writeFile(path.join(root, 'README.md'), markdown);
  const { checkLinks } = await import('../scripts/docs-links.mjs');
  return checkLinks(root, ['README.md']);
}
test('documentation accepts encoded paths, duplicate and formatted anchors, reference links and images', async () => {
  await fixture(async root => {
    assert.deepEqual(await check(root, '# Home\n\n[local](#home)\n\n[page][p]\n\n![image](LICENSE)\n\n[formatted](docs/Some%20page.md#formatted-code)\n\n[p]: docs/Some%20page.md#same-1\n'), []);
  });
});
test('documentation reports missing files, headings and image targets', async () => {
  await fixture(async root => {
    const errors = await check(root, '# Home\n\n[missing](gone.md)\n\n[bad][target]\n\n![missing](gone.png)\n\n[target]: docs/Some%20page.md#absent\n');
    assert.equal(errors.length, 3);
    assert.match(errors.join('\n'), /gone.md/);
    assert.match(errors.join('\n'), /absent/);
    assert.match(errors.join('\n'), /gone.png/);
  });
});
test('documentation ignores fenced and inline examples and external destinations without fetching', async () => {
  await fixture(async root => {
    assert.deepEqual(await check(root, '# Home\n\n```markdown\n[example](missing.md)\n```\n\n`[example](missing.md)`\n\n[web](https://example.invalid/no-network)\n\n[email](mailto:nobody@example.invalid)\n'), []);
  });
});
test('documentation rejects missing source documents and paths escaping its root', async () => {
  await fixture(async root => {
    const { checkLinks } = await import('../scripts/docs-links.mjs');
    assert.equal((await checkLinks(root, ['absent.md'])).length, 1);
    assert.match((await check(root, '[escape](../outside.md)')).join('\n'), /outside root/);
  });
});

test('docs command checks newly staged Markdown, ignores untracked files, and fails on lint and links', async () => {
  await fixture(async root => {
    execFileSync('git', ['init', '--quiet'], { cwd: root });
    const source = path.join(root, 'README.md');
    await writeFile(source, '# Home\n\nValid.\n');
    await writeFile(path.join(root, 'untracked.md'), '# Bad\n\n[broken](absent.md)\n');
    execFileSync('git', ['add', 'README.md'], { cwd: root });
    const script = fileURLToPath(new URL('../scripts/docs-check.mjs', import.meta.url));
    const run = () => spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
    assert.equal(run().status, 0);
    await writeFile(source, '# Home\n\n### Skipped level\n');
    assert.notEqual(run().status, 0, 'the lint process must actually run');
    await writeFile(source, '# Home\n\n[missing](absent.md)\n');
    assert.notEqual(run().status, 0, 'broken local links must fail the command');
  });
});
