import fs from "node:fs";
import path from "node:path";

const siteRoot = path.resolve(import.meta.dirname, "..");
const tradingPage = path.join(siteRoot, "trading.html");
const signalsDir = "/Users/aaron/laplace-office/laplace-agent/memory/trading/signals";
const maxEntries = Number(process.env.TRADING_LOG_LIMIT || 14);

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function inlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
}

function sentenceFrom(text) {
  return text
    .replace(/\s+/g, " ")
    .replace(/^[-*]\s*/, "")
    .trim();
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return sentenceFrom(match[1]);
  }
  return "";
}

function section(text, startHeading, endHeading) {
  const start = text.indexOf(startHeading);
  if (start === -1) return "";
  const afterStart = text.slice(start + startHeading.length);
  const end = afterStart.indexOf(endHeading);
  return end === -1 ? afterStart : afterStart.slice(0, end);
}

function titleFromDraft(draft, fallback) {
  let title = firstMatch(draft, [
    /\*\*Title:\*\*\s*(.+)/,
    /-\s*Title:\s*(.+)/,
    /^Title:\s*(.+)$/m,
  ]);
  if (!title) title = fallback;
  return title
    .replace(/^AI Trading Log\s*#?_*[0-9]*\s*[-—:]\s*/i, "")
    .replace(/^AI Trading Cycle\s*[-—:]\s*/i, "")
    .trim();
}

function extractField(draft, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`\\*\\*${escaped}:\\*\\*\\s*([\\s\\S]*?)(?=\\n\\*\\*[A-Z][^\\n:]{1,40}:\\*\\*|\\n## |$)`),
    new RegExp(`^-\\s*${escaped}:\\s*([\\s\\S]*?)(?=\\n-\\s*[A-Z][^\\n:]{1,40}:|\\n## |$)`, "m"),
    new RegExp(`^${escaped}:\\s*([\\s\\S]*?)(?=\\n[A-Z][^\\n:]{1,40}:|\\n## |$)`, "m"),
  ];
  return sentenceFrom(firstMatch(draft, patterns));
}

function signalTime(fileName, text) {
  const heading = text.match(/^# Trading Cycle\s*[-—]\s*(.+)$/m)?.[1] || "";
  const fileBase = path.basename(fileName, ".md");
  const isoish = fileBase.replace(
    /^(\d{4})-(\d{2})-(\d{2})-(\d{2})(?:\d{2})?$/,
    "$1-$2-$3T$4:00:00+08:00",
  );
  return { heading, fileBase, time: new Date(isoish).getTime() || 0 };
}

function displayDate(fileBase) {
  const match = fileBase.match(/^(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})?$/);
  if (!match) return fileBase;
  const [, yyyy, mm, dd, hh] = match;
  const date = new Date(`${yyyy}-${mm}-${dd}T${hh}:00:00+08:00`);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  }).format(date);
}

function parseSignal(file) {
  const text = fs.readFileSync(file, "utf8");
  const meta = signalTime(file, text);
  const draft = section(text, "## Website Trading Log Draft", "## X Short Draft").trim();
  if (!draft) return null;

  const finalDecision = section(text, "## Final Decision", "## Gateway Request Summary");
  const gatewayStatus = section(text, "## Gateway / Account Status", "## Candidate Setups");
  const accountValue = firstMatch(gatewayStatus, [/\*\*Account value:\*\*\s*\*\*\$?([^*\n]+)\*\*/i, /Account value:\s*\*\*\$?([^*\n]+)\*\*/i]);
  const tradeNoTrade = firstMatch(finalDecision, [
    /\*\*Trade \/ No trade:\*\*\s*\*\*?([^*\n]+)\*\*?/i,
    /Trade \/ No trade:\s*\*\*?([^*\n]+)\*\*?/i,
  ]);
  const result = extractField(draft, "Result");
  const decision = extractField(draft, "Decision") || tradeNoTrade || "No position opened.";
  const why = extractField(draft, "Why");
  const risk = extractField(draft, "Risk");
  const lesson = extractField(draft, "Lesson");

  return {
    ...meta,
    accountValue,
    status: /\bno trade\b/i.test(`${tradeNoTrade} ${decision} ${result} ${finalDecision}`) ? "No trade" : "Trade",
    title: titleFromDraft(draft, "Trading decision recorded."),
    decision,
    why,
    risk,
    result,
    lesson,
  };
}

function card(entry, index, total) {
  const logNo = String(total - index).padStart(3, "0");
  const meta = `${displayDate(entry.fileBase)} CST · AI Trading Log #${logNo} · ${entry.status}`;
  const why = entry.why || entry.decision || entry.result;
  const risk = entry.risk ? `<p><span class="pill">Risk</span> ${inlineMarkdown(entry.risk)}</p>` : "";
  const result = entry.result ? `<p><span class="pill">Result</span> ${inlineMarkdown(entry.result)}</p>` : "";
  const lesson = entry.lesson
    ? `<div class="lesson"><strong>Lesson:</strong> ${inlineMarkdown(entry.lesson)}</div>`
    : "";

  return `    <article class="log-card">
        <div class="log-meta">${escapeHtml(meta)}</div>
        <h3>${inlineMarkdown(entry.title)}</h3>
        <p><span class="pill">Decision</span> ${inlineMarkdown(entry.decision || entry.status)}</p>
        <p>${inlineMarkdown(why)}</p>
        ${risk}
        ${result}
        ${lesson}
    </article>`;
}

const signalFiles = fs
  .readdirSync(signalsDir)
  .filter((name) => name.endsWith(".md"))
  .map((name) => path.join(signalsDir, name));

const allEntries = signalFiles
  .map(parseSignal)
  .filter(Boolean)
  .sort((a, b) => b.time - a.time);

const entries = allEntries.slice(0, maxEntries);
if (!entries.length) {
  throw new Error(`No trading log entries parsed from ${signalsDir}`);
}

let html = fs.readFileSync(tradingPage, "utf8");
const rendered = entries.map((entry, index) => card(entry, index, allEntries.length)).join("\n\n");
const generatedBlock = `    <!-- TRADING_LOG_START generated by scripts/update-trading-log.mjs -->
${rendered}
    <!-- TRADING_LOG_END -->`;

const logPattern =
  /    <!-- TRADING_LOG_START generated by scripts\/update-trading-log\.mjs -->[\s\S]*?    <!-- TRADING_LOG_END -->/;

if (logPattern.test(html)) {
  html = html.replace(logPattern, generatedBlock);
} else {
  html = html.replace(
    /(<h2>AI Trading Log<\/h2>\s*<p class="section-note">[\s\S]*?<\/p>\s*)[\s\S]*?(\s*<h2>Wallet<\/h2>)/,
    (_match, before, after) => `${before}\n${generatedBlock}\n${after}`,
  );
}

const latest = entries[0];
if (latest.accountValue) {
  const accountDisplay = `$${Number(String(latest.accountValue).replace(/,/g, "")).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
  html = html.replace(/<div class="account-value" id="accountValue">[^<]+<\/div>/, `<div class="account-value" id="accountValue">${accountDisplay}</div>`);
  html = html.replace(/\$1,000 USDC on Hyperliquid DEX/, `${accountDisplay} on Hyperliquid DEX`);
}

html = html.replace(
  /<p class="section-note">The public narrative layer: what I saw, what I did, what I learned\. No-trade decisions are part of the record\.(?: Last synced from internal trading-cycle memory: [^<]+ CST\.)?<\/p>/,
  `<p class="section-note">The public narrative layer: what I saw, what I did, what I learned. No-trade decisions are part of the record. Last synced from internal trading-cycle memory: ${escapeHtml(displayDate(latest.fileBase))} CST.</p>`,
);

fs.writeFileSync(tradingPage, html);
console.log(`Updated trading.html with ${entries.length} entries; latest ${latest.fileBase}.`);
