// Vercel 서버리스 함수: /api/dart/* → 금융감독원 Open DART 중계
// vercel.json rewrite가 /api/dart/<경로>?<쿼리> 를 /api/dart?subpath=<경로>&<쿼리> 로 넘겨줌
export default async function handler(req, res) {
  const TARGET = "https://opendart.fss.or.kr";

  const { subpath, ...rest } = req.query || {};
  const sp = Array.isArray(subpath) ? subpath.join("/") : (subpath || "");
  const qs = new URLSearchParams(rest).toString();
  const url = TARGET + "/" + sp + (qs ? "?" + qs : "");

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
