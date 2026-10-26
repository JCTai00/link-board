const json = (d, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json;charset=utf-8" } });
const dec = s => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

// 抓取網頁的標題與縮圖（Open Graph / Twitter Card）
async function fetchMeta(url) {
  const m = {};
  let t = "";
  try {
    const r = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; LinkBoard/1.0)", accept: "text/html,*/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(6000),
    });
    if (!(r.headers.get("content-type") || "").includes("html")) return {};
    await new HTMLRewriter()
      .on("meta", {
        element(e) {
          const k = (e.getAttribute("property") || e.getAttribute("name") || "").toLowerCase();
          const c = e.getAttribute("content");
          if (!c) return;
          if (k === "og:title") m.title ??= c;
          else if (k === "og:image" || k === "og:image:url") m.image ??= c;
          else if (k === "twitter:image") m.image2 ??= c;
        },
      })
      .on("title", { text(x) { t += x.text; } })
      .transform(r)
      .arrayBuffer();
    let image = m.image || m.image2;
    try { image = image ? new URL(image, r.url).href : null; } catch { image = null; }
    if (image && !/^https?:\/\//i.test(image)) image = null;
    return { title: dec((m.title || t).trim()).slice(0, 300), image };
  } catch {
    return {};
  }
}

const cleanTags = a =>
  [...new Set((Array.isArray(a) ? a : []).map(x => String(x).trim().slice(0, 30)).filter(Boolean))].slice(0, 20);

export default {
  async fetch(req, env) {
    const p = new URL(req.url).pathname, method = req.method;
    if (!p.startsWith("/api/")) return env.ASSETS.fetch(req);
    try {
      if (p === "/api/links" && method === "GET") {
        const { results: L } = await env.DB.prepare(
          "SELECT id, url, title, image, created_at AS t FROM links ORDER BY created_at DESC").all();
        const { results: T } = await env.DB.prepare("SELECT link_id, tag FROM link_tags").all();
        const map = {};
        T.forEach(x => (map[x.link_id] ||= []).push(x.tag));
        return json(L.map(l => ({ ...l, tags: map[l.id] || [] })));
      }

      if (p === "/api/links" && method === "POST") {
        const b = await req.json();
        let url = String(b.url || "").trim();
        if (!/^https?:\/\//i.test(url)) url = "https://" + url;
        let host;
        try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { return json({ error: "網址格式不正確" }, 400); }

        let title = String(b.title || "").trim().slice(0, 300);
        let image = typeof b.image === "string" && /^(https?:\/\/|data:image\/)/.test(b.image) && b.image.length < 400000 ? b.image : null;
        if (!title || !image) {
          const meta = await fetchMeta(url);
          title ||= meta.title || "";
          image ||= meta.image || null;
        }
        title ||= host;
        const tags = cleanTags(b.tags);
        if (!tags.length) tags.push("未分類");

        const now = Date.now();
        const r = await env.DB.prepare("INSERT INTO links (url, title, image, created_at) VALUES (?, ?, ?, ?)")
          .bind(url, title, image, now).run();
        const id = r.meta.last_row_id;
        await env.DB.batch(tags.map(t => env.DB.prepare("INSERT INTO link_tags (link_id, tag) VALUES (?, ?)").bind(id, t)));
        return json({ id, url, title, image, tags, t: now }, 201);
      }

      const d = p.match(/^\/api\/links\/(\d+)$/);
      if (d && method === "DELETE") {
        const id = Number(d[1]);
        await env.DB.batch([
          env.DB.prepare("DELETE FROM link_tags WHERE link_id = ?").bind(id),
          env.DB.prepare("DELETE FROM links WHERE id = ?").bind(id),
        ]);
        return json({ ok: true });
      }
      return json({ error: "Not found" }, 404);
    } catch (e) {
      return json({ error: "伺服器錯誤：" + e.message }, 500);
    }
  },
};
