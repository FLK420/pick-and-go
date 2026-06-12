// Vercel 서버리스 함수: 브라우저 → /api/dart/* → 금융감독원 Open DART 중계
export default async function handler(req, res) {
  const TARGET = "https://opendart.fss.or.kr";
  const path = req.url.replace(/^\/api\/dart/, "");
  const url = TARGET + path;

  try {
    const r = await fetch(url, { method: req.method });
    const text = await r.text();
    res.status(r.status);
    res.setHeader("content-type", r.headers.get("content-type") || "application/json");
    res.send(text);
  } catch (e) {
    res.status(502).json({ error: "DART proxy failed", detail: String(e) });
  }
}
