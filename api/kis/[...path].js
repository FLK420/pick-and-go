// Vercel 서버리스 함수: 브라우저 → /api/kis/* → 한국투자증권(KIS) 실전 도메인 중계
// (배포본에는 Vite 프록시가 없으므로 이 함수가 CORS/도메인 문제를 대신 해결)
export default async function handler(req, res) {
  const TARGET = "https://openapi.koreainvestment.com:9443";
  // /api/kis 접두사를 떼고 나머지 경로+쿼리를 그대로 전달
  const path = req.url.replace(/^\/api\/kis/, "");
  const url = TARGET + path;

  // KIS가 요구하는 헤더만 선별 전달 (host 등은 제외)
  const headers = {};
  for (const h of ["authorization", "appkey", "appsecret", "tr_id", "custtype", "content-type"]) {
    if (req.headers[h]) headers[h] = req.headers[h];
  }

  const init = { method: req.method, headers };
  if (req.method !== "GET" && req.method !== "HEAD") {
    // 토큰 발급(tokenP)은 JSON 바디 POST
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
