import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // [한국투자증권] 브라우저 /kis → 한투 도메인 대리 (CORS 우회)
      // ⚠️ 중요: '국내주식 현재가 시세' 조회는 모의(vts) 도메인이 지원하지 않습니다.
      //    시세는 '실전 도메인'에서 같은 appkey 로 조회합니다(계좌 비종속).
      //    → 따라서 시세용 타깃은 openapi.koreainvestment.com:9443 (실전) 사용.
      //    (모의 매매/잔고가 필요할 때만 openapivts.koreainvestment.com:29443 로)
      "/kis": {
        target: "https://openapi.koreainvestment.com:9443",
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/kis/, ""),
      },
      // [Open DART] 브라우저 /dart → opendart.fss.or.kr 대리 (CORS 우회)
      "/dart": {
        target: "https://opendart.fss.or.kr",
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/dart/, ""),
      },
    },
  },
});