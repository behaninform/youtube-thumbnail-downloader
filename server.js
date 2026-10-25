const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;
app.use(express.json());
app.get("/", (_, res) => res.sendFile(path.join(__dirname, "index.html")));

const QUALITIES = [
  { key: "maxresdefault", name: "Max HD", size: "1280 x 720" },
  { key: "sddefault", name: "SD", size: "640 x 480" },
  { key: "hqdefault", name: "HQ", size: "480 x 360" },
  { key: "mqdefault", name: "Medium", size: "320 x 180" },
  { key: "default", name: "Small", size: "120 x 90" }
];

function parseId(input) {
  input = String(input || "").trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(input)) return input;
  try {
    const u = new URL(input.startsWith("http") ? input : "https://" + input);
    const h = u.hostname.toLowerCase().replace(/^www\./, "");
    let id = null;
    if (h === "youtu.be") id = u.pathname.split("/")[1];
    else if (h === "youtube.com" || h.endsWith(".youtube.com") || h === "youtube-nocookie.com") {
      if (u.pathname === "/watch") id = u.searchParams.get("v");
      else {
        const m = u.pathname.match(/^\/(shorts|embed|live|v)\/([^/?#]+)/);
        if (m) id = m[2];
      }
    }
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}

const imgUrl = (id, q) => `https://img.youtube.com/vi/${id}/${q}.jpg`;

async function exists(id, q) {
  try {
    const r = await fetch(imgUrl(id, q), { method: "HEAD", signal: AbortSignal.timeout(8000) });
    return r.ok && (r.headers.get("content-type") || "").startsWith("image");
  } catch { return false; }
}

app.post("/api/info", async (req, res) => {
  const id = parseId(req.body && req.body.url);
  if (!id) return res.status(400).json({ error: "Please paste a valid YouTube video link." });
  const checks = await Promise.all(QUALITIES.map(q => exists(id, q.key)));
  const available = QUALITIES.filter((q, i) => checks[i]);
  if (!available.length) return res.status(422).json({ error: "No thumbnail found. Check that the video exists and is not private." });
  let title = null;
  try {
    const r = await fetch("https://www.youtube.com/oembed?format=json&url=" +
      encodeURIComponent("https://www.youtube.com/watch?v=" + id), { signal: AbortSignal.timeout(6000) });
    if (r.ok) title = (await r.json()).title || null;
  } catch {}
  res.json({ id, title, qualities: available });
});

app.get("/api/download", async (req, res) => {
  const id = parseId(req.query.id);
  const q = QUALITIES.find(x => x.key === req.query.q);
  if (!id || !q) return res.status(400).send("Invalid request");
  try {
    const r = await fetch(imgUrl(id, q.key), { signal: AbortSignal.timeout(15000) });
    if (!r.ok) return res.status(404).send("Thumbnail not available");
    const buf = Buffer.from(await r.arrayBuffer());
    res.set({
      "Content-Type": "image/jpeg",
      "Content-Disposition": `attachment; filename="youtube-thumbnail-${id}-${q.key}.jpg"`
    });
    res.send(buf);
  } catch (e) {
    console.error("download error:", e.message);
    res.status(500).send("Download failed. Try again.");
  }
});

app.get("/health", (_, res) => res.send("ok"));
app.listen(PORT, () => console.log("Server running on port " + PORT));
