import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const siteUrl = 'https://laplaceagent.com';
const today = new Date().toISOString().slice(0, 10);

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    if (entry.isFile() && entry.name.endsWith('.html')) files.push(full);
  }
  return files;
}

function toUrl(file) {
  const rel = path.relative(root, file).split(path.sep).join('/');
  if (rel === 'index.html') return `${siteUrl}/`;
  if (rel.endsWith('/index.html')) return `${siteUrl}/${rel.slice(0, -'index.html'.length)}`;
  return `${siteUrl}/${rel}`;
}

function normalizeCanonical(url) {
  if (url === siteUrl) return `${siteUrl}/`;
  return url;
}

function getTag(html, pattern) {
  return html.match(pattern)?.[1]?.trim() ?? '';
}

function priority(url) {
  if (url === `${siteUrl}/`) return '1.0';
  if (url === `${siteUrl}/blog/`) return '0.9';
  if (url.includes('/blog/posts/')) return '0.9';
  if (url.endsWith('/trading.html') || url.endsWith('/trading-methodology.html')) return '0.9';
  if (url.includes('/benchmarks/') || url.includes('/comparison/')) return '0.8';
  if (url.endsWith('/faq.html') || url.endsWith('/what-is-agent-laplace.html')) return '0.8';
  return '0.7';
}

function isVerificationPage(url) {
  return /\/google[^/]*\.html$/.test(url) || url.endsWith('/google-site-verification.html');
}

const postMetaPath = path.join(root, 'blog', 'posts.json');
const postMeta = fs.existsSync(postMetaPath) ? JSON.parse(fs.readFileSync(postMetaPath, 'utf8')) : { posts: [] };
const postsByUrl = new Map();
for (const post of postMeta.posts ?? []) {
  const candidates = [
    path.join(root, 'blog', 'posts', `${post.date}-${post.slug}.html`),
    path.join(root, 'blog', 'posts', `${post.slug}.html`),
  ];
  const file = candidates.find((candidate) => fs.existsSync(candidate));
  if (file) postsByUrl.set(toUrl(file), post);
}

const urls = [];
const seen = new Set();
for (const file of walk(root)) {
  const html = fs.readFileSync(file, 'utf8');
  const url = toUrl(file);
  if (isVerificationPage(url)) continue;
  if (/<meta\s+name=["']robots["'][^>]*noindex/i.test(html)) continue;

  const canonical = normalizeCanonical(getTag(html, /<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i) || url);
  if (!canonical.startsWith(siteUrl)) continue;
  if (canonical !== url && canonical !== url.replace(/index\.html$/, '')) continue;
  if (seen.has(canonical)) continue;
  seen.add(canonical);

  const post = postsByUrl.get(canonical);
  const mtime = fs.statSync(file).mtime.toISOString().slice(0, 10);
  urls.push({ loc: canonical, lastmod: post?.date ?? mtime, priority: priority(canonical) });
}

urls.sort((a, b) => {
  const ap = Number(b.priority) - Number(a.priority);
  if (ap !== 0) return ap;
  return a.loc.localeCompare(b.loc);
});

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
  .map((entry) => `  <url><loc>${entry.loc}</loc><lastmod>${entry.lastmod}</lastmod><priority>${entry.priority}</priority></url>`)
  .join('\n')}\n</urlset>\n`;
fs.writeFileSync(path.join(root, 'sitemap.xml'), sitemap);

const latestPosts = [...(postMeta.posts ?? [])]
  .filter((post) => postsByUrl.has(`${siteUrl}/blog/posts/${post.date}-${post.slug}.html`) || postsByUrl.has(`${siteUrl}/blog/posts/${post.slug}.html`))
  .sort((a, b) => b.date.localeCompare(a.date))
  .slice(0, 20);

function escapeXml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function postUrl(post) {
  const dated = `${siteUrl}/blog/posts/${post.date}-${post.slug}.html`;
  if (postsByUrl.has(dated)) return dated;
  return `${siteUrl}/blog/posts/${post.slug}.html`;
}

const rss = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">\n  <channel>\n    <title>Agent Laplace Research</title>\n    <link>${siteUrl}/blog/</link>\n    <description>Crypto trading, AI agents, agent economy infrastructure, and transparent market research from Agent Laplace.</description>\n    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>\n${latestPosts
  .map((post) => `    <item>\n      <title>${escapeXml(post.title)}</title>\n      <link>${postUrl(post)}</link>\n      <guid>${postUrl(post)}</guid>\n      <pubDate>${new Date(`${post.date}T00:00:00Z`).toUTCString()}</pubDate>\n      <description>${escapeXml(post.description)}</description>\n    </item>`)
  .join('\n')}\n  </channel>\n</rss>\n`;
fs.writeFileSync(path.join(root, 'rss.xml'), rss);

const llmsPath = path.join(root, 'llms.txt');
let llms = fs.existsSync(llmsPath) ? fs.readFileSync(llmsPath, 'utf8') : '# Agent Laplace\n';
const start = '<!-- SEO-LATEST-POSTS:START -->';
const end = '<!-- SEO-LATEST-POSTS:END -->';
const latestSection = `${start}\n\n## Latest Research\n\n${latestPosts
  .slice(0, 8)
  .map((post) => `- [${post.title}](${postUrl(post)}): ${post.description}`)
  .join('\n')}\n\n${end}`;
if (llms.includes(start) && llms.includes(end)) {
  llms = llms.replace(new RegExp(`${start}[\\s\\S]*?${end}`), latestSection);
} else {
  llms = `${llms.trim()}\n\n${latestSection}\n`;
}
fs.writeFileSync(llmsPath, llms.endsWith('\n') ? llms : `${llms}\n`);

const robotsPath = path.join(root, 'robots.txt');
let robots = fs.existsSync(robotsPath) ? fs.readFileSync(robotsPath, 'utf8') : 'User-agent: *\nAllow: /\n';
if (!robots.includes('Sitemap: https://laplaceagent.com/sitemap.xml')) {
  robots = `${robots.trim()}\nSitemap: https://laplaceagent.com/sitemap.xml\n`;
}
fs.writeFileSync(robotsPath, robots.endsWith('\n') ? robots : `${robots}\n`);

console.log(`SEO updated: ${urls.length} sitemap URLs, ${latestPosts.length} RSS posts, ${today}`);
