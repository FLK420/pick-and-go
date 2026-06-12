// Vercel 서버리스 함수: /api/kis/* → 한국투자증권(KIS) 실전 도메인 중계
// vercel.json rewrite가 /api/kis/<경로>?<쿼리> 를 /api/kis?subpath=<경로>&<쿼리> 로 넘겨줌
export default async function handler(req, res) {
  const TARGET = "https://openapi.koreainvestment.com:9443";

  // subpath(중계할 KIS 경로)와 나머지 쿼리 분리
  const { subpath, ...rest } = req.query || {};
  const sp = Array.isArray(subpath) ? subpath.join("/") : (subpath || "");
  const qs = new URLSearchParams(rest).toString();
  const url = TARGET + "/" + sp + (qs ? "?" + qs : "");

  // KIS가 요구하는 헤더만 선별 전달
  const headers = {};
  for (const h of ["authorization", "appkey", "appsecret", "tr_id", "custtype", "content-type"]) {
    if (req.headers[h]) headers[h] = req.headers[h];
  }

  const init = { method: req.method, headers };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
    if (!headers["content-type"]) headers["content-type"] = "application/json";
  }

  try {
    const r = await fetch(url, init);
    const text = await r.text();
    res.status(r.status);
    res.setHeader("content-type", r.headers.get("content-type") || "application/json");
    res.send(text);
  } catch (e) {
    res.status(502).json({ error: "KIS proxy failed", detail: String(e) });
  }
}
