import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('src/content/posts');
const outDir = path.resolve('public/translations');
const languages = { en: 'en', ja: 'ja', ko: 'ko' };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function walk(dir) {
  const items = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const item of items) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) files.push(...await walk(full));
    else if (item.isFile() && item.name.endsWith('.md')) files.push(full);
  }
  return files;
}
function parseMarkdown(source) {
  const match = source.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  const front = match?.[1] || '';
  const body = source.slice(match?.[0].length || 0);
  const scalar = key => {\n    const line = front.split(/\r?\n/).find(item => item.startsWith(key + ':'));\n    return (line ? line.slice(key.length + 1).trim().replace(/^[\\"']|[\\"']$/g, '') : '');\n  };
  const tagsText = front.match(/^tags:\s*\n((?:\s+-.*\n?)*)/m)?.[1] || '';
  const tags = [...tagsText.matchAll(/^\s+-\s*["']?(.*?)["']?\s*$/gm)].map(m => m[1]);
  const blocks = body.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
  const texts = new Set();
  for (const block of blocks) {
    if (/^(```|~~~)/.test(block) || /^\|/.test(block)) continue;
    const text = block.split('\n').map(line => line
      .replace(/^\s{0,3}#{1,6}\s+/, '')
      .replace(/^\s*>\s?/, '')
      .replace(/^\s*[-*+]\s+/, '')
      .replace(/^\s*\d+[.)]\s+/, '')
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[*_~`]/g, '')
      .trim()).filter(Boolean).join(' ');
    if (text && text.length < 450) texts.add(text);
    else if (text) {
      for (const sentence of text.match(/[^。！？.!?]+[。！？.!?]?/g) || []) {
        const part = sentence.trim();
        if (part && part.length < 450) texts.add(part);
      }
    }
  }
  return { title: scalar('title'), description: scalar('description'), category: scalar('category') || '随笔', tags, texts: [...texts] };
}
async function translate(text, target) {
  const url = new URL('https://api.mymemory.translated.net/get');
  url.search = new URLSearchParams({ q: text.slice(0, 450), langpair: 'zh-CN|' + target }).toString();
  const response = await fetch(url);
  if (!response.ok) throw new Error('HTTP ' + response.status);
  const data = await response.json();
  if (data.responseStatus !== 200 || !data.responseData?.translatedText) throw new Error(data.responseDetails || 'No translation returned');
  return data.responseData.translatedText;
}
await mkdir(outDir, { recursive: true });
const files = await walk(root);
let errors = 0;
for (const file of files) {
  const source = await readFile(file, 'utf8');
  const post = parseMarkdown(source);
  const slug = path.relative(root, file).replace(/\\/g, '/').replace(/\.md$/, '').replace(/\//g, '--');
  for (const [language, target] of Object.entries(languages)) {
    const map = {};
    const all = [post.title, post.description, post.category, ...post.tags, ...post.texts].filter(Boolean);
    for (const original of [...new Set(all)]) {
      try {
        map[original] = await translate(original, target);
        await sleep(100);
      } catch (error) {
        errors++;
        console.warn('[translate]', slug, language, JSON.stringify(original.slice(0, 60)), String(error));
      }
    }
    const result = {
      language,
      title: map[post.title] || post.title,
      description: map[post.description] || post.description,
      category: map[post.category] || post.category,
      tags: post.tags.map(tag => map[tag] || tag),
      strings: map
    };
    await writeFile(path.join(outDir, slug + '.' + language + '.json'), JSON.stringify(result), 'utf8');
  }
}
console.log('Translation generation finished for', files.length, 'posts. Failed requests:', errors);
