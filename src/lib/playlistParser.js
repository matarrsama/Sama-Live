/**
 * Minimal M3U/M3U8 parser to extract channels
 * Returns array of { id, name, group, logo, url, raw }
 */
function parseAttributes(attrString) {
  const attrs = {};
  const regex = /([A-Za-z0-9\-]+)="([^"]*)"/g;
  let m;
  while ((m = regex.exec(attrString)) !== null) {
    attrs[m[1]] = m[2];
  }
  return attrs;
}

function parseM3U(text) {
  if (!text) return [];
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const items = [];
  let lastExtinf = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    if (line.startsWith("#EXTINF")) {
      lastExtinf = line;
      continue;
    }
    if (line.startsWith("#")) continue;
    // this is a URL
    const url = line;
    let name = "";
    let group = "";
    let logo = "";
    if (lastExtinf) {
      // #EXTINF:-1 tvg-id="..." tvg-name="Name" tvg-logo="..." group-title="Group",Display Name
      const after = lastExtinf.split(":").slice(1).join(":");
      const parts = after.split(",");
      const attrs = parseAttributes(parts[0] || "");
      name = (
        parts.slice(1).join(",") ||
        attrs["tvg-name"] ||
        attrs["title"] ||
        ""
      ).trim();
      logo = attrs["tvg-logo"] || "";
      group = attrs["group-title"] || "";
    }
    const id = `${name || url}__${items.length}`;
    items.push({
      id,
      name: name || url,
      group,
      logo,
      url,
      rawLine: lastExtinf || "",
    });
    lastExtinf = null;
  }
  return items;
}

module.exports = { parseM3U };
