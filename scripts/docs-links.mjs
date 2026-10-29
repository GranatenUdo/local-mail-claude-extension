import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { marked } from 'marked';
import GithubSlugger from 'github-slugger';
import { convert } from 'html-to-text';

// Parse Markdown rather than scanning source with regexes: code fences and
// inline examples are not links, while reference links are resolved by marked.
function document(source) {
  const tokens = marked.lexer(source);
  const headings = new Set();
  const links = [];
  const slugger = new GithubSlugger();
  marked.walkTokens(tokens, token => {
    if (token.type === 'heading') {
      const text = convert(marked.parseInline(token.text), {
        wordwrap: false,
        selectors: [{ selector: 'a', options: { ignoreHref: true } }],
      });
      headings.add(slugger.slug(text));
    }
    if (token.type === 'link' || token.type === 'image') links.push(token.href);
  });
  return { headings, links };
}

export async function checkLinks(root, files) {
  root = path.resolve(root);
  const errors = [];
  const cache = new Map();
  async function readDocument(file) {
    if (!cache.has(file)) cache.set(file, document(await readFile(file, 'utf8')));
    return cache.get(file);
  }
  for (const file of files) {
    const source = path.resolve(root, file);
    let parsed;
    try { parsed = await readDocument(source); }
    catch { errors.push(`${file}: cannot read Markdown source`); continue; }
    for (const href of parsed.links) {
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href)) continue;
      try {
        const hash = href.indexOf('#');
        const pathname = decodeURIComponent((hash < 0 ? href : href.slice(0, hash)).split('?')[0]);
        const fragment = hash < 0 ? '' : decodeURIComponent(href.slice(hash + 1));
        const target = pathname ? path.resolve(path.dirname(source), pathname) : source;
        const relative = path.relative(root, target);
        if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
          throw new Error('target outside root');
        }
        if (!(await stat(target)).isFile()) throw new Error('target is not a file');
        if (fragment && /\.md$/i.test(target) && !(await readDocument(target)).headings.has(fragment)) {
          throw new Error('missing heading');
        }
      } catch (error) {
        errors.push(`${file}: ${href} — ${error.code === 'ENOENT' ? 'missing target' : error.message}`);
      }
    }
  }
  return errors;
}
