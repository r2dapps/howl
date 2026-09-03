/** Safe markdown for chat bubbles: actions, emphasis, lists, code. */

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function looksLikeMarkdown(text) {
  return /[*_`#>\-]/.test(text || "");
}

export function renderMarkdown(raw) {
  if (raw == null || raw === "") return "";
  let s = String(raw).replace(/\r\n/g, "\n").replace(/[＊⁎∗]/g, "*");

  const fences = [];
  s = s.replace(/```([\s\S]*?)```/g, (_, code) => {
    const i = fences.length;
    fences.push("<pre><code>" + escapeHtml(code.replace(/^\n/, "")) + "</code></pre>");
    return `\u0000F${i}\u0000`;
  });

  s = escapeHtml(s);

  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  s = s.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  s = s.replace(/(^|\s)_([^_\n]+)_/g, "$1<em>$2</em>");

  const lines = s.split("\n");
  const out = [];
  let list = null;
  let quote = [];

  const flushQuote = () => {
    if (!quote.length) return;
    out.push("<blockquote>" + quote.join("<br>") + "</blockquote>");
    quote = [];
  };
  const flushList = () => {
    if (!list) return;
    out.push("<ul>" + list.map((item) => "<li>" + item + "</li>").join("") + "</ul>");
    list = null;
  };

  for (const line of lines) {
    const q = line.match(/^&gt;\s?(.*)$/);
    if (q) {
      flushList();
      quote.push(q[1]);
      continue;
    }
    flushQuote();
    const li = line.match(/^\s*-\s+(.+)$/);
    if (li) {
      list = list || [];
      list.push(li[1]);
      continue;
    }
    flushList();
    if (line.trim() === "") {
      out.push("");
    } else {
      out.push(line);
    }
  }
  flushQuote();
  flushList();

  s = out
    .join("\n")
    .split(/\n{2,}/)
    .map((block) => {
      if (!block.trim()) return "";
      if (block.startsWith("<ul>") || block.startsWith("<blockquote>") || block.startsWith("<pre>")) {
        return block;
      }
      return "<p>" + block.replace(/\n/g, "<br>") + "</p>";
    })
    .join("");

  s = s.replace(/\u0000F(\d+)\u0000/g, (_, i) => fences[Number(i)]);
  return s;
}

export { escapeHtml, looksLikeMarkdown };
