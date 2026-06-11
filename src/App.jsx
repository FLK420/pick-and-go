import React, { useState, useMemo, useEffect, useRef } from "react";

/* =============================================================================
 *  PICK & GO  v1.0  —  AI 투자 플랫폼 (모바일 앱 프로토타입)
 *  단일 파일(src/App.jsx) 구동 · Vite + React + Tailwind CSS
 *  디자인: 토스 스타일 미니멀리즘 / 포인트 컬러 #0050ff
 *  ※ 색상·다크모드·커스텀 치수는 inline style 로 처리하여 어떤 환경에서도
 *    동일하게 렌더링되도록 했습니다. (Tailwind 임의값 클래스 미사용)
 * ========================================================================== */

const BRAND = "#0050ff";
const BRAND_LIGHT = "#aac2ff"; // 비활성/연한 포인트 톤
const UP = "#f04452"; // 상승(한국식: 빨강)
const DOWN = "#3182f6"; // 하락(한국식: 파랑)

/* ----------------------------------------------------------------------------
 *  실시간 주가 API (한국투자증권 KIS · 모의투자) 설정
 *  - CORS는 Vite devServer 프록시(/kis → vts.koreainvestment.com:9443)로 우회
 *  - 인증정보는 import.meta.env.VITE_KIS_APP_KEY / VITE_KIS_APP_SECRET 에서 로드
 *  - 시세 조회 TR_ID는 실전·모의 공통 FHKST01010100
 * -------------------------------------------------------------------------- */
const KIS_BASE = "/kis"; // Vite 프록시 루트 (vite.config.js 에서 한투 도메인으로 대리)
// 현재가 시세(inquire-price)는 계좌 비종속이라 실전·모의 공통 FHKST01010100 으로 동작합니다.
// 만약 본인 모의 계정 문서가 다른 값을 지시하면 아래만 "VTST01010100" 으로 바꾸세요.
const KIS_TR_PRICE = "FHKST01010100"; // 국내주식 현재가 시세 TR_ID

/* ----------------------------------------------------------------------------
 *  재무제표 API (금융감독원 Open DART · 단일회사 전체 재무제표)
 *  - CORS는 Vite devServer 프록시(/dart → opendart.fss.or.kr)로 우회
 *  - 인증키는 import.meta.env.VITE_DART_API_KEY 에서 로드 (하드코딩 금지)
 *  - corp_code: DART 고유번호(8자리). corpCode.xml 에서 조회.
 *    삼성전자/SK하이닉스는 확인됨. 나머지는 본인이 corpCode.xml 로 채워 넣으세요.
 *    (빈 문자열이면 해당 종목은 DART 호출을 건너뛰고 Mock 재무를 유지합니다)
 * -------------------------------------------------------------------------- */
const DART_BASE = "/dart"; // Vite 프록시 루트 (vite.config.js 에서 opendart.fss.or.kr 로 대리)
const DART_CORP_CODE = {
  samsung: "00126380",   // 삼성전자 (확인됨)
  skhynix: "00164779",   // SK하이닉스 (확인됨)
  naver: "",             // ⚠️ corpCode.xml 에서 확인 후 입력
  ecopro: "",            // ⚠️ 에코프로비엠
  hyundai: "",           // ⚠️ 현대차
  celltrion: "",         // ⚠️ 셀트리온
  kakao: "",             // ⚠️ 카카오
  lges: "",              // ⚠️ LG에너지솔루션
};

// DART 금액(원, 문자열) → "조/억" 한글 포맷 (UI 표기 통일). 음수(적자)도 처리.
function fmtDartAmount(raw) {
  const n = parseFloat(String(raw).replace(/,/g, ""));
  if (!isFinite(n)) return null;
  const neg = n < 0;
  const abs = Math.abs(n);
  const jo = Math.floor(abs / 1e12);
  const eok = Math.floor((abs % 1e12) / 1e8);
  const body = jo > 0 ? `${jo.toLocaleString()}조 ${eok.toLocaleString()}억` : `${eok.toLocaleString()}억`;
  return (neg ? "-" : "") + body;
}

// 보고서 코드 → 라벨
const REPRT_LABEL = { "11011": "사업보고서", "11012": "반기보고서", "11013": "1분기보고서", "11014": "3분기보고서" };
// 기간 전환: 연간(사업보고서) / 분기(최신 분기·반기 우선). 각 (연도×보고서) 후보를 최신순으로 시도.
const DART_PERIODS = {
  annual: { label: "연간", reprts: ["11011"], years: (y) => [y - 1, y - 2, y - 3] },
  quarter: { label: "분기", reprts: ["11014", "11012", "11013"], years: (y) => [y, y - 1] },
};

/* ----------------------------------------------------------------------------
 *  가상 데이터 (실서버 fetch 연동 시 동일 구조로 교체)
 * -------------------------------------------------------------------------- */
const INITIAL_STOCKS = [
  {
    id: "samsung",
    name: "삼성전자",
    ticker: "005930",
    initial: "삼",
    logoColor: "#1428A0",
    sector: "반도체",
    price: 73400,
    change: 1200,
    changePct: 1.66,
    tags: ["반도체", "대형주", "저평가", "3년 우상향", "AI"],
    spark: [69, 70, 68, 71, 70, 72, 71, 73, 72, 74, 73, 75],
    aiScore: 88,
    aiReason:
      "글로벌 HBM 수요 확대와 파운드리 가동률 회복이 맞물리며 메모리 업황 반등 국면에 진입했습니다. 현재 PBR은 과거 5년 평균을 하회해 밸류에이션 부담이 낮습니다.",
    aiSummary: [
      "HBM·서버 D램 수요 회복으로 실적 턴어라운드 기대",
      "PBR 1.2배 수준, 역사적 저점 대비 매력적 구간",
      "외국인 5거래일 연속 순매수 유입 중",
    ],
    revenue: [
      { year: "2022", value: 302 },
      { year: "2023", value: 258 },
      { year: "2024", value: 301 },
    ],
    financials: {
      자산총계: "459조 2,860억",
      부채총계: "92조 2,820억",
      자본총계: "366조 9,990억",
      매출액: "300조 8,700억",
      영업이익: "32조 7,260억",
      당기순이익: "34조 4,510억",
    },
  },
  {
    id: "skhynix",
    name: "SK하이닉스",
    ticker: "000660",
    initial: "SK",
    logoColor: "#E60012",
    sector: "반도체",
    price: 198500,
    change: 6500,
    changePct: 3.39,
    tags: ["반도체", "HBM", "성장주", "3년 우상향", "AI"],
    spark: [120, 128, 135, 142, 150, 158, 165, 172, 180, 188, 193, 198],
    aiScore: 92,
    aiReason:
      "AI 가속기향 HBM3E 독점적 공급 지위를 확보하며 메모리 업체 중 가장 가파른 이익 레버리지를 보이고 있습니다. 엔비디아 공급망 핵심 수혜주입니다.",
    aiSummary: [
      "HBM3E 양산 선점으로 AI 메모리 시장 주도",
      "분기 영업이익 사상 최대치 경신 흐름",
      "다만 단기 주가 급등에 따른 변동성 유의",
    ],
    revenue: [
      { year: "2022", value: 44 },
      { year: "2023", value: 32 },
      { year: "2024", value: 66 },
    ],
    financials: {
      자산총계: "100조 1,200억",
      부채총계: "42조 5,400억",
      자본총계: "57조 5,800억",
      매출액: "66조 1,930억",
      영업이익: "23조 4,670억",
      당기순이익: "19조 7,970억",
    },
  },
  {
    id: "naver",
    name: "NAVER",
    ticker: "035420",
    initial: "N",
    logoColor: "#03C75A",
    sector: "IT·플랫폼",
    price: 187600,
    change: -2300,
    changePct: -1.21,
    tags: ["플랫폼", "AI", "저평가"],
    spark: [210, 205, 200, 198, 202, 196, 192, 195, 190, 188, 190, 187],
    aiScore: 74,
    aiReason:
      "커머스·광고 본업의 견조함 대비 주가는 과도하게 조정받았습니다. 자체 LLM '하이퍼클로바X' 상용화 진척이 리레이팅 트리거가 될 수 있습니다.",
    aiSummary: [
      "커머스 거래액 두 자릿수 성장 지속",
      "AI 검색·광고 결합으로 수익화 초기 단계",
      "주가 밸류에이션은 역사적 하단권",
    ],
    revenue: [
      { year: "2022", value: 8.2 },
      { year: "2023", value: 9.7 },
      { year: "2024", value: 10.7 },
    ],
    financials: {
      자산총계: "38조 4,200억",
      부채총계: "14조 1,300억",
      자본총계: "24조 2,900억",
      매출액: "10조 7,377억",
      영업이익: "1조 9,830억",
      당기순이익: "1조 2,540억",
    },
  },
  {
    id: "ecopro",
    name: "에코프로비엠",
    ticker: "247540",
    initial: "에",
    logoColor: "#00A86B",
    sector: "2차전지",
    price: 142000,
    change: -4100,
    changePct: -2.81,
    tags: ["2차전지", "성장주", "변동성"],
    spark: [180, 175, 168, 172, 165, 160, 155, 150, 148, 145, 146, 142],
    aiScore: 61,
    aiReason:
      "전기차 캐즘(일시적 수요 둔화)으로 양극재 출하가 정체되어 있으나, 하반기 신규 고객사 물량 반영 시 회복 가능성이 있습니다. 현재는 변동성 관리가 필요한 구간입니다.",
    aiSummary: [
      "전기차 수요 둔화로 단기 실적 압박",
      "양극재 단가 하락이 마진 부담 요인",
      "하반기 북미 IRA 수혜 물량이 관전 포인트",
    ],
    revenue: [
      { year: "2022", value: 5.3 },
      { year: "2023", value: 6.9 },
      { year: "2024", value: 4.4 },
    ],
    financials: {
      자산총계: "8조 9,400억",
      부채총계: "5조 1,200억",
      자본총계: "3조 8,200억",
      매출액: "4조 4,012억",
      영업이익: "1,640억",
      당기순이익: "980억",
    },
  },
  {
    id: "hyundai",
    name: "현대차",
    ticker: "005380",
    initial: "현",
    logoColor: "#002C5F",
    sector: "자동차",
    price: 248000,
    change: 3500,
    changePct: 1.43,
    tags: ["자동차", "고배당", "저평가", "3년 우상향"],
    spark: [200, 205, 210, 215, 220, 228, 232, 238, 242, 245, 246, 248],
    aiScore: 81,
    aiReason:
      "하이브리드 판매 호조와 제네시스 고부가 차종 비중 확대로 수익성이 개선되고 있습니다. 배당성향 상향 및 자사주 매입 등 주주환원 강화가 매력적입니다.",
    aiSummary: [
      "하이브리드 수요 강세로 믹스 개선",
      "주주환원율 35% 목표 상향 발표",
      "PER 5배 내외, 글로벌 동종 대비 저평가",
    ],
    revenue: [
      { year: "2022", value: 142 },
      { year: "2023", value: 162 },
      { year: "2024", value: 175 },
    ],
    financials: {
      자산총계: "291조 4,000억",
      부채총계: "180조 2,000억",
      자본총계: "111조 2,000억",
      매출액: "175조 2,310억",
      영업이익: "15조 1,270억",
      당기순이익: "13조 2,440억",
    },
  },
  {
    id: "celltrion",
    name: "셀트리온",
    ticker: "068270",
    initial: "셀",
    logoColor: "#0070C0",
    sector: "바이오",
    price: 178300,
    change: 2100,
    changePct: 1.19,
    tags: ["바이오", "성장주", "AI"],
    spark: [160, 162, 158, 165, 168, 170, 172, 169, 174, 176, 177, 178],
    aiScore: 77,
    aiReason:
      "바이오시밀러 포트폴리오 확장과 미국 직판 체계 안착으로 외형 성장이 가속화되고 있습니다. 신규 제품 허가가 추가 모멘텀으로 작용할 전망입니다.",
    aiSummary: [
      "짐펜트라 미국 처방 확대로 매출 점프",
      "바이오시밀러 신제품 파이프라인 풍부",
      "환율·약가 정책은 점검 필요 변수",
    ],
    revenue: [
      { year: "2022", value: 2.3 },
      { year: "2023", value: 2.2 },
      { year: "2024", value: 3.6 },
    ],
    financials: {
      자산총계: "12조 6,800억",
      부채총계: "3조 4,100억",
      자본총계: "9조 2,700억",
      매출액: "3조 5,570억",
      영업이익: "4,920억",
      당기순이익: "3,340억",
    },
  },
  {
    id: "kakao",
    name: "카카오",
    ticker: "035720",
    initial: "K",
    logoColor: "#FEE500",
    logoText: "#3A1D1D",
    sector: "IT·플랫폼",
    price: 41250,
    change: -650,
    changePct: -1.55,
    tags: ["플랫폼", "AI", "변동성"],
    spark: [52, 50, 48, 47, 45, 44, 43, 44, 42, 43, 42, 41],
    aiScore: 58,
    aiReason:
      "본업 광고·커머스의 더딘 회복과 신사업 적자가 부담입니다. 다만 AI 비서 서비스 출시와 비핵심 자회사 정리가 진행 중이어서 체질 개선 여부를 지켜볼 단계입니다.",
    aiSummary: [
      "광고 회복 지연으로 이익 모멘텀 약함",
      "AI 신규 서비스가 반등 트리거 후보",
      "지배구조·규제 리스크 상존",
    ],
    revenue: [
      { year: "2022", value: 7.1 },
      { year: "2023", value: 8.1 },
      { year: "2024", value: 7.9 },
    ],
    financials: {
      자산총계: "23조 1,000억",
      부채총계: "9조 8,000억",
      자본총계: "13조 3,000억",
      매출액: "7조 8,740억",
      영업이익: "5,030억",
      당기순이익: "-1,780억",
    },
  },
  {
    id: "lges",
    name: "LG에너지솔루션",
    ticker: "373220",
    initial: "LG",
    logoColor: "#A50034",
    sector: "2차전지",
    price: 372000,
    change: 8000,
    changePct: 2.20,
    tags: ["2차전지", "대형주", "성장주"],
    spark: [340, 345, 338, 350, 355, 360, 358, 365, 368, 370, 369, 372],
    aiScore: 70,
    aiReason:
      "전기차 캐즘에도 ESS(에너지저장장치) 수주가 가파르게 늘며 매출 공백을 메우고 있습니다. 북미 현지 생산 확대로 IRA 보조금 수혜가 본격화됩니다.",
    aiSummary: [
      "ESS 부문 고성장으로 포트폴리오 다변화",
      "북미 가동률 상승에 따른 AMPC 수취 확대",
      "전기차 수요 회복 시점이 핵심 변수",
    ],
    revenue: [
      { year: "2022", value: 25 },
      { year: "2023", value: 33 },
      { year: "2024", value: 25 },
    ],
    financials: {
      자산총계: "52조 1,000억",
      부채총계: "29조 4,000억",
      자본총계: "22조 7,000억",
      매출액: "25조 6,196억",
      영업이익: "1조 5,360억",
      당기순이익: "1조 1,020억",
    },
  },
];

const MOCK_NEWS = {
  samsung: [
    { type: "disclosure", title: "[정정] 자기주식 취득 신탁계약 체결 결정", source: "Open DART", time: "09:42" },
    { type: "news", title: "삼성전자, HBM4 샘플 주요 고객사 공급 시작", source: "전자신문", time: "08:15" },
    { type: "news", title: "“메모리 업황 바닥 통과”… 증권가 목표가 상향 잇따라", source: "한국경제", time: "어제" },
    { type: "disclosure", title: "분기보고서 제출 (2025.03)", source: "Open DART", time: "2일 전" },
  ],
  skhynix: [
    { type: "news", title: "SK하이닉스, HBM3E 12단 양산 본격화", source: "디지털타임스", time: "10:05" },
    { type: "disclosure", title: "시설투자 등의 결정 (청주 M15X)", source: "Open DART", time: "09:10" },
    { type: "news", title: "엔비디아 차세대 GPU에 하이닉스 HBM 단독 채택설", source: "이데일리", time: "어제" },
  ],
  naver: [
    { type: "news", title: "네이버, 하이퍼클로바X 기업용 API 가격 인하", source: "ZDNet", time: "11:20" },
    { type: "disclosure", title: "타법인 주식 취득 결정", source: "Open DART", time: "어제" },
    { type: "news", title: "커머스 거래액 전년比 14% 증가", source: "매일경제", time: "2일 전" },
  ],
  ecopro: [
    { type: "news", title: "에코프로비엠, 신규 고객사와 양극재 장기 공급 논의", source: "서울경제", time: "13:40" },
    { type: "disclosure", title: "단일판매·공급계약 체결", source: "Open DART", time: "어제" },
  ],
  hyundai: [
    { type: "disclosure", title: "현금·현물배당 결정 (분기배당)", source: "Open DART", time: "08:30" },
    { type: "news", title: "현대차 하이브리드 판매 사상 최대… 美 시장 호조", source: "조선비즈", time: "어제" },
    { type: "news", title: "제네시스 고급화 전략으로 ASP 상승", source: "오토타임즈", time: "3일 전" },
  ],
  celltrion: [
    { type: "news", title: "셀트리온 짐펜트라, 미국 처방 데이터 호조", source: "약업신문", time: "12:10" },
    { type: "disclosure", title: "의약품 품목허가 획득", source: "Open DART", time: "어제" },
  ],
  kakao: [
    { type: "news", title: "카카오, 대화형 AI 비서 ‘카나나’ 비공개 테스트", source: "블로터", time: "14:55" },
    { type: "disclosure", title: "최대주주 등 소유주식 변동 신고", source: "Open DART", time: "어제" },
  ],
  lges: [
    { type: "news", title: "LG엔솔, 북미 ESS 대형 수주 공시", source: "에너지경제", time: "09:00" },
    { type: "disclosure", title: "단일판매·공급계약 체결 (ESS)", source: "Open DART", time: "09:00" },
    { type: "news", title: "전기차 캐즘에도 ESS가 실적 버팀목", source: "한국경제", time: "2일 전" },
  ],
};

const NEWS_AI_SUMMARY = {
  samsung: ["HBM·메모리 업황 회복 신호가 뚜렷합니다.", "자사주 취득 등 주주환원 의지를 확인했습니다.", "외국인 매수세가 단기 수급을 받치고 있습니다."],
  skhynix: ["AI 메모리 독점 지위가 공시·뉴스로 재확인됐습니다.", "신규 설비투자로 중장기 캐파를 확보합니다.", "엔비디아 공급망 기대가 주가에 반영 중입니다."],
  naver: ["AI 수익화와 커머스 성장이 동시에 진행됩니다.", "투자 관련 공시는 신사업 확장 신호입니다.", "단기 실적보다 리레이팅 여부가 관건입니다."],
  ecopro: ["신규 공급계약이 수요 둔화를 일부 상쇄합니다.", "단가·물량 회복 시점이 핵심 변수입니다.", "변동성이 큰 구간이라 분할 접근이 유효합니다."],
  hyundai: ["배당 공시로 주주환원 매력이 부각됩니다.", "하이브리드 중심 믹스 개선이 지속됩니다.", "글로벌 동종 대비 밸류에이션이 낮습니다."],
  celltrion: ["미국 처방 확대가 매출 성장을 견인합니다.", "신규 품목허가가 파이프라인을 강화합니다.", "환율·약가 정책은 점검할 변수입니다."],
  kakao: ["AI 신규 서비스가 반등 트리거 후보입니다.", "지배구조 관련 공시 흐름을 주시해야 합니다.", "본업 회복 속도가 더딘 점은 부담입니다."],
  lges: ["ESS 대형 수주가 매출 공백을 메웁니다.", "북미 생산 확대로 보조금 수혜가 커집니다.", "전기차 수요 회복 시점이 관전 포인트입니다."],
};

const SUGGEST_CHIPS = ["3년 우상향", "반도체", "2차전지", "고배당", "저평가", "AI"];

const TEST_QUESTIONS = [
  {
    q: "투자한 종목이 한 달 만에 -20% 하락했습니다. 어떻게 하시겠어요?",
    options: [
      { label: "저점 매수 기회다. 추가 매수한다", type: "aggressive" },
      { label: "일단 지켜보며 흐름을 관찰한다", type: "neutral" },
      { label: "더 큰 손실이 두렵다. 손절한다", type: "stable" },
    ],
  },
  {
    q: "여유자금 1,000만 원이 생겼습니다. 어디에 두시겠어요?",
    options: [
      { label: "성장 테마주·코인 등 고위험 자산", type: "aggressive" },
      { label: "우량 대형주와 ETF에 분산", type: "neutral" },
      { label: "예적금·채권 등 원금 보전 위주", type: "stable" },
    ],
  },
  {
    q: "당신이 기대하는 연간 수익률은?",
    options: [
      { label: "연 20% 이상 (큰 손실도 감수)", type: "aggressive" },
      { label: "연 7~15% 수준의 안정적 성장", type: "neutral" },
      { label: "예금 금리보다 조금 높은 정도", type: "stable" },
    ],
  },
  {
    q: "종목을 고를 때 가장 먼저 보는 것은?",
    options: [
      { label: "단기 모멘텀과 테마, 거래량", type: "aggressive" },
      { label: "실적 성장성과 산업 전망", type: "neutral" },
      { label: "배당·재무 안정성과 부채비율", type: "stable" },
    ],
  },
  {
    q: "투자 결과를 확인하는 주기는?",
    options: [
      { label: "하루에도 수시로 확인한다", type: "aggressive" },
      { label: "주 1~2회 정도 점검한다", type: "neutral" },
      { label: "한 달에 한 번이면 충분하다", type: "stable" },
    ],
  },
];

const TEST_RESULT = {
  aggressive: {
    emoji: "🦁",
    title: "공격 투자형",
    desc: "높은 변동성을 감내하고 적극적으로 초과수익을 추구하는 유형입니다. 성장주·테마 비중을 높이되 손절 원칙을 명확히 세우세요.",
    alloc: [
      { name: "성장·테마주", pct: 60, color: BRAND },
      { name: "우량 대형주", pct: 30, color: "#6aa0ff" },
      { name: "현금·채권", pct: 10, color: "#c9d6ff" },
    ],
  },
  neutral: {
    emoji: "🦅",
    title: "중립 성장형",
    desc: "위험과 수익의 균형을 추구하는 유형입니다. 우량주와 ETF를 중심으로 분산하고 일부 성장주로 초과수익을 노려보세요.",
    alloc: [
      { name: "우량 대형주·ETF", pct: 55, color: BRAND },
      { name: "성장주", pct: 25, color: "#6aa0ff" },
      { name: "현금·채권", pct: 20, color: "#c9d6ff" },
    ],
  },
  stable: {
    emoji: "🐢",
    title: "안정 추구형",
    desc: "원금 보전을 최우선으로 하는 유형입니다. 배당주·채권 비중을 높이고 변동성이 큰 자산은 소액으로 제한하는 전략이 적합합니다.",
    alloc: [
      { name: "배당주·채권", pct: 60, color: BRAND },
      { name: "우량 대형주", pct: 25, color: "#6aa0ff" },
      { name: "성장주", pct: 15, color: "#c9d6ff" },
    ],
  },
};

/* ----------------------------------------------------------------------------
 *  유틸
 * -------------------------------------------------------------------------- */
const won = (n) => n.toLocaleString("ko-KR");

function buildSparkPath(data, w, h, pad) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = (w - pad * 2) / (data.length - 1);
  return data
    .map((v, i) => {
      const x = pad + i * step;
      const y = pad + (h - pad * 2) * (1 - (v - min) / range);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

const makeTheme = (dark) =>
  dark
    ? {
        bg: "#0b0e14",
        surface: "#151a23",
        surface2: "#1c222e",
        text: "#f1f3f5",
        sub: "#8b95a1",
        line: "#252b36",
        navBg: "rgba(11,14,20,0.92)",
        chip: "#1c222e",
      }
    : {
        bg: "#f2f4f6",
        surface: "#ffffff",
        surface2: "#f7f8fa",
        text: "#191f28",
        sub: "#8b95a1",
        line: "#eef1f4",
        navBg: "rgba(255,255,255,0.92)",
        chip: "#f2f4f6",
      };

/* ----------------------------------------------------------------------------
 *  프레젠테이션 컴포넌트 (입력 요소 없음 → 최상위 정의 안전)
 * -------------------------------------------------------------------------- */
// 기업 로고 도메인 (Clearbit 로고 API). 로딩 실패 시 이니셜 원형으로 자동 폴백.
const LOGO_DOMAIN = {
  samsung: "samsung.com",
  skhynix: "skhynix.com",
  naver: "navercorp.com",
  ecopro: "ecopro.co.kr",
  hyundai: "hyundai.com",
  celltrion: "celltrion.com",
  kakao: "kakaocorp.com",
  lges: "lgensol.com",
};

function StockLogo({ stock, size = 44 }) {
  const domain = LOGO_DOMAIN[stock.id];
  const [imgOk, setImgOk] = useState(Boolean(domain));

  if (domain && imgOk) {
    return (
      <div
        className="flex items-center justify-center rounded-full flex-shrink-0"
        style={{ width: size, height: size, backgroundColor: "#fff", overflow: "hidden", border: "1px solid rgba(0,0,0,0.06)" }}
      >
        <img
          src={`https://logo.clearbit.com/${domain}`}
          alt={stock.name}
          width={size}
          height={size}
          style={{ width: "82%", height: "82%", objectFit: "contain" }}
          onError={() => setImgOk(false)}
        />
      </div>
    );
  }

  // 폴백: 기존 이니셜 원형 (로고 로딩 실패 / 도메인 미등록 시)
  return (
    <div
      className="flex items-center justify-center rounded-full font-bold flex-shrink-0"
      style={{
        width: size,
        height: size,
        backgroundColor: stock.logoColor,
        color: stock.logoText || "#fff",
        fontSize: size * 0.36,
        letterSpacing: "-0.02em",
      }}
    >
      {stock.initial}
    </div>
  );
}

function Sparkline({ data, color, w = 64, h = 32 }) {
  const path = buildSparkPath(data, w, h, 3);
  const gid = useMemo(() => "g" + Math.random().toString(36).slice(2, 8), []);
  const areaPath = `${path} L${w - 3},${h - 3} L3,${h - 3} Z`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gid})`} />
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Toggle({ on, onChange }) {
  return (
    <button
      onClick={() => onChange(!on)}
      style={{
        width: 50,
        height: 30,
        borderRadius: 999,
        backgroundColor: on ? BRAND : "#c4ccd6",
        position: "relative",
        transition: "background-color .2s ease",
        flexShrink: 0,
      }}
      aria-pressed={on}
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          left: on ? 23 : 3,
          width: 24,
          height: 24,
          borderRadius: "50%",
          backgroundColor: "#fff",
          transition: "left .2s ease",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        }}
      />
    </button>
  );
}

function StarButton({ active, onClick, theme }) {
  return (
    <button onClick={onClick} style={{ padding: 6, lineHeight: 1, flexShrink: 0 }} aria-label="관심종목">
      <svg width="24" height="24" viewBox="0 0 24 24">
        <path
          d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
          fill={active ? "#f5476b" : theme.sub}
        />
      </svg>
    </button>
  );
}

function StockRow({ stock, theme, starred, onToggleStar, onOpen, loading }) {
  const up = stock.change >= 0;
  const c = up ? UP : DOWN;
  const ell = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
  return (
    <div
      onClick={onOpen}
      style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", padding: "13px 4px" }}
    >
      <StockLogo stock={stock} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...ell, color: theme.text, fontSize: 16, fontWeight: 700 }}>{stock.name}</div>
        <div style={{ ...ell, color: theme.sub, fontSize: 12.5, marginTop: 2 }}>{stock.sector}</div>
      </div>
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
          <div className="pg-shimmer" style={{ width: 50, height: 13, borderRadius: 5 }} />
          <div className="pg-shimmer" style={{ width: 74, height: 14, borderRadius: 5 }} />
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", lineHeight: 1.2, flexShrink: 0 }}>
          <span style={{ color: c, fontSize: 13, fontWeight: 700 }}>
            {up ? "+" : ""}{stock.changePct}%
          </span>
          <span style={{ color: theme.text, fontSize: 15.5, fontWeight: 700, marginTop: 2 }}>
            {won(stock.price)}원
          </span>
        </div>
      )}
      <StarButton active={starred} theme={theme} onClick={(e) => { e.stopPropagation(); onToggleStar(); }} />
    </div>
  );
}

/* ----------------------------------------------------------------------------
 *  메인 App
 * -------------------------------------------------------------------------- */
export default function App() {
  const [tab, setTab] = useState("home");
  const [query, setQuery] = useState("");
  const [stars, setStars] = useState(["skhynix", "hyundai"]);
  const [selected, setSelected] = useState(null);
  const [modalShown, setModalShown] = useState(false);
  const [modalTab, setModalTab] = useState("ai");
  const [dartOpen, setDartOpen] = useState(false);

  // Gemini AI 서치 상태
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiStocks, setAiStocks] = useState(null); // null이면 기본 키워드 스크리너 표시

  // 실시간 주가 (한국투자증권 KIS) — INITIAL_STOCKS를 상태로 승격해 단일 진실 공급원으로 사용
  const [stocks, setStocks] = useState(INITIAL_STOCKS);
  const [priceLoading, setPriceLoading] = useState(true);
  const [priceLive, setPriceLive] = useState(false); // 한 종목이라도 실시간 반영 성공 여부
  const didFetchPrices = useRef(false); // StrictMode 중복/무한 호출 방어

  // DART 실시간 재무 — 캐시 키: `${id}_${period}` (연간/분기 따로 캐싱)
  const [finData, setFinData] = useState({});
  const [finLoading, setFinLoading] = useState(false);
  const [dartPeriod, setDartPeriod] = useState("annual"); // annual | quarter
  const [fullOpen, setFullOpen] = useState(false); // 전체 재무제표 펼침 여부

  const [dark, setDark] = useState(false);
  const [notifMorning, setNotifMorning] = useState(true);
  const [notifPrice, setNotifPrice] = useState(false);

  // 투자성향 테스트 상태
  const [step, setStep] = useState(0);
  const [scores, setScores] = useState({ aggressive: 0, neutral: 0, stable: 0 });
  const [testDone, setTestDone] = useState(false);

  const theme = makeTheme(dark);

  const toggleStar = (id) =>
    setStars((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const openStock = (s) => {
    setSelected(s);
    setModalTab("ai");
    setDartOpen(false);
    setModalShown(false);
    requestAnimationFrame(() => requestAnimationFrame(() => setModalShown(true)));
    setDartPeriod("annual");
    setFullOpen(false);
    fetchFinancialData(s, "annual"); // DART 실시간 재무 조회 (캐시 있으면 내부에서 건너뜀)
  };
  const closeStock = () => {
    setModalShown(false);
    setTimeout(() => setSelected(null), 300);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return stocks;
    const tokens = q.split(/\s+/);
    return stocks.filter((s) => {
      const hay = (s.name + " " + s.ticker + " " + s.sector + " " + s.tags.join(" ")).toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
  }, [query, stocks]);

  const starredStocks = stocks.filter((s) => stars.includes(s.id));

  /* ---------------------------------------------------------------------------
   *  Gemini AI 서치 (gemini-1.5-flash)
   *  - 인증키: import.meta.env.VITE_GEMINI_API_KEY (하드코딩 금지)
   *  - 프롬프트 인젝션: 반드시 INITIAL_STOCKS 안에서만 선택하도록 시스템 지침 고정
   *  - 응답: { picks: [{ id, reason, risk }] } JSON 강제
   * ------------------------------------------------------------------------- */
  const GEMINI_MODEL = "gemini-1.5-flash";

  // Gemini 응답에서 순수 JSON만 안전하게 파싱 (코드펜스/잡텍스트 방어)
  function safeParseJson(raw) {
    if (!raw) return null;
    let t = String(raw).trim();
    t = t.replace(/```json/gi, "").replace(/```/g, "").trim();
    try {
      return JSON.parse(t);
    } catch {
      const s = t.indexOf("{");
      const e = t.lastIndexOf("}");
      if (s !== -1 && e !== -1 && e > s) {
        try {
          return JSON.parse(t.slice(s, e + 1));
        } catch {
          return null;
        }
      }
      return null;
    }
  }

  async function runGeminiSearch() {
    const q = query.trim();
    if (!q || aiLoading) return;

    setAiLoading(true);
    setAiError("");

    try {
      const apiKey = import.meta.env?.VITE_GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("VITE_GEMINI_API_KEY 환경 변수가 설정되지 않았습니다.");
      }

      // AI에게 넘길 종목 유니버스 (실데이터 구조 그대로, 토큰 절약 위해 필요한 필드만)
      const universe = stocks.map((s) => ({
        id: s.id,
        name: s.name,
        sector: s.sector,
        tags: s.tags,
        price: s.price,
        changePct: s.changePct,
        revenue: s.revenue,
        aiScore: s.aiScore,
      }));

      // === 프롬프트 인젝션: 시스템 지침 ===
      const systemPrompt = [
        "당신은 한국 주식 전문 애널리스트 AI입니다. 사용자의 자연어 투자 조건을 해석해 종목을 선별합니다.",
        "반드시 아래 [종목 유니버스]에 포함된 종목들 중에서만 선택해야 합니다. 목록에 없는 종목을 절대 지어내지 마세요.",
        "사용자 조건에 부합하는 종목을 적합도 높은 순으로 최대 6개까지 고르세요. 부합하는 종목이 없으면 picks를 빈 배열로 두세요.",
        "각 종목마다 'reason'(추천 사유, 한국어 2~3문장)과 'risk'(주의해야 할 리스크, 한국어 1~2문장)를 작성하세요.",
        "reason과 risk는 제공된 sector/tags/revenue/changePct/aiScore 데이터에 근거해 구체적으로 서술하세요.",
        "출력은 반드시 아래 JSON 스키마만 따르고, 그 외 설명/머리말/코드펜스를 절대 포함하지 마세요.",
        '스키마: {"picks":[{"id":"종목id","reason":"추천 사유","risk":"리스크"}]}',
        "id 값은 반드시 [종목 유니버스]의 id 필드와 정확히 일치해야 합니다.",
      ].join("\n");

      const userPrompt =
        `사용자 투자 조건: "${q}"\n\n` +
        `[종목 유니버스]\n${JSON.stringify(universe)}`;

      const endpoint =
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=` +
        encodeURIComponent(apiKey);

      const res = await fetch(endpoint, {
        method: "POST",
        mode: "cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.4,
            maxOutputTokens: 2048,
          },
        }),
      });

      if (!res.ok) {
        // 실패 시 응답 본문 전체를 콘솔에 노출 (원인 파악용: 잘못된 키/모델/쿼터 등)
        let errBody = "";
        try {
          errBody = await res.text();
        } catch (e2) {
          errBody = "(응답 본문 읽기 실패: " + e2 + ")";
        }
        console.error("[Gemini] HTTP", res.status, res.statusText, "\nresponse body:", errBody);
        throw new Error("Gemini API 응답 오류: HTTP " + res.status + " — " + errBody.slice(0, 300));
      }

      const data = await res.json();
      const text =
        (data?.candidates?.[0]?.content?.parts || [])
          .map((p) => p?.text || "")
          .join("") || "";

      const parsed = safeParseJson(text);
      const picks = Array.isArray(parsed?.picks) ? parsed.picks : [];

      // Gemini가 고른 id를 실데이터와 병합 (live reason/risk 바인딩)
      const merged = picks
        .map((p) => {
          const base = stocks.find((s) => s.id === p.id);
          if (!base) return null;
          return {
            ...base,
            aiReason: (p.reason && String(p.reason).trim()) || base.aiReason,
            aiRisk: (p.risk && String(p.risk).trim()) || "",
          };
        })
        .filter(Boolean);

      if (merged.length === 0) {
        setAiStocks([]); // 빈 결과 상태 (UI에서 '결과 없음' 표시)
      } else {
        setAiStocks(merged);
      }
    } catch (err) {
      console.error("[Gemini]", err);
      setAiError("AI 서버와 통신 중 오류가 발생했습니다");
      setAiStocks(null);
    } finally {
      setAiLoading(false);
    }
  }

  // 검색어를 직접 수정하면 AI 결과/에러를 해제하고 실시간 키워드 스크리너로 복귀
  const onQueryChange = (v) => {
    setQuery(v);
    if (aiStocks !== null) setAiStocks(null);
    if (aiError) setAiError("");
  };
  const clearQuery = () => {
    setQuery("");
    setAiStocks(null);
    setAiError("");
  };

  /* ---------------------------------------------------------------------------
   *  실시간 주가 파이프라인 (한국투자증권 KIS · 모의투자)
   *  - 마운트 시 1회만 호출 (didFetchPrices ref + 빈 deps) → 무한루프 방어
   *  - 1) {KIS_BASE}/oauth2/tokenP 로 access_token 발급 (함수당 1회)
   *  - 2) 종목별 inquire-price 순차 조회 (종목당 0.3초 딜레이)
   *  - 종목별 개별 try/catch + 전체 try/catch → 실패 시 해당 종목/전체 Mock 유지
   *  - 실패 응답 본문(body)을 console.error 로 그대로 노출
   * ------------------------------------------------------------------------- */
  async function fetchStockPrices() {
    const appKey = import.meta.env?.VITE_KIS_APP_KEY;
    const appSecret = import.meta.env?.VITE_KIS_APP_SECRET;
    if (!appKey || !appSecret) {
      // 인증정보 미설정: Mock 데이터로 정상 구동 (앱이 죽지 않음)
      setPriceLoading(false);
      return;
    }

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    try {
      // 1) 접근토큰(access_token) 발급 — 함수당 1회
      const tokenRes = await fetch(`${KIS_BASE}/oauth2/tokenP`, {
        method: "POST",
        mode: "cors",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          grant_type: "client_credentials",
          appkey: appKey,
          appsecret: appSecret,
        }),
      });
      if (!tokenRes.ok) {
        let body = "";
        try { body = await tokenRes.text(); } catch (e2) { body = "(본문 읽기 실패: " + e2 + ")"; }
        console.error("[KIS] 토큰 발급 실패 HTTP", tokenRes.status, tokenRes.statusText, "\nresponse body:", body);
        throw new Error("토큰 발급 실패: HTTP " + tokenRes.status + " — " + body.slice(0, 300));
      }
      const tokenJson = await tokenRes.json();
      const accessToken = tokenJson.access_token;
      if (!accessToken) {
        console.error("[KIS] access_token 없음:", tokenJson);
        throw new Error("access_token 없음: " + (tokenJson.error_description || JSON.stringify(tokenJson)));
      }

      // 2) 종목별 현재가 순차 조회 (종목당 0.3초 딜레이로 전산망 차단 방어)
      const updates = [];
      for (const base of INITIAL_STOCKS) {
        const code = base.ticker; // 기존 6자리 종목코드 (예: "005930")
        if (!code) continue;
        try {
          const url =
            `${KIS_BASE}/uapi/domestic-stock/v1/quotations/inquire-price` +
            `?FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=${encodeURIComponent(code)}`;
          const res = await fetch(url, {
            method: "GET",
            mode: "cors",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${accessToken}`,
              appkey: appKey,
              appsecret: appSecret,
              tr_id: KIS_TR_PRICE,
            },
          });
          if (!res.ok) {
            let body = "";
            try { body = await res.text(); } catch (e2) { body = "(본문 읽기 실패: " + e2 + ")"; }
            console.error("[KIS]", base.id, "조회 실패 HTTP", res.status, "\nresponse body:", body);
            throw new Error("HTTP " + res.status);
          }

          const json = await res.json();
          const out = json.output;
          if (!out || !out.stck_prpr) {
            // 데이터 없음 / 거부 응답 → 해당 종목 Mock 유지 (KIS는 거부 사유를 msg1로 줌)
            console.warn("[KIS]", base.id, "output 없음:", json.msg_cd, json.msg1, json);
            continue;
          }

          const price = parseInt(out.stck_prpr, 10);            // 현재가 (stck_prpr)
          const pct = parseFloat(out.prdy_ctrt);                // 전일 대비율 (prdy_ctrt, 부호 포함)
          const sign = out.prdy_vrss_sign;                      // 1·2=상승 / 3=보합 / 4·5=하락
          const mag = Math.abs(parseInt(out.prdy_vrss, 10));    // 전일 대비 (prdy_vrss, 절대값)
          const change = sign === "4" || sign === "5" ? -mag : mag;
          if (!isFinite(price) || price <= 0) continue;

          updates.push({
            id: base.id,
            price,
            change: isFinite(change) ? change : base.change,
            changePct: isFinite(pct) ? Number(pct.toFixed(2)) : base.changePct,
          });
        } catch (e) {
          console.warn("[KIS] 종목 실패:", base.id, e); // 개별 종목만 Mock fallback
        }
        await sleep(300); // 종목당 0.3초
      }

      if (updates.length > 0) {
        // 받아온 종목만 갱신, 나머지는 기존 Mock 유지 → 상태에 캐싱(재호출 없음)
        setStocks((prev) =>
          prev.map((s) => {
            const u = updates.find((x) => x.id === s.id);
            return u ? { ...s, price: u.price, change: u.change, changePct: u.changePct } : s;
          })
        );
        setPriceLive(true);
      }
    } catch (err) {
      // 토큰 실패 / CORS / 네트워크 단절 등 전체 실패: Mock 유지, 화면 안 죽음
      console.error("[KIS] 전체 실패:", err);
    } finally {
      setPriceLoading(false);
    }
  }

  useEffect(() => {
    if (didFetchPrices.current) return; // 중복/무한 호출 차단
    didFetchPrices.current = true;
    fetchStockPrices();
    // 마운트 1회만 실행 (의도된 빈 deps)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------------------------------------------------------------------
   *  DART 실시간 재무 (fnlttSinglAcntAll · 단일회사 전체 재무제표)
   *  - 모달 오픈 시 호출. 종목별 1회만 조회하고 finData 에 캐싱(재호출 없음).
   *  - 손익계산서(IS/CIS)에서 매출액·영업이익 추출 (연결 CFS 우선).
   *  - 키/corp_code 없거나 실패 시 → 기존 Mock 재무 유지 (앱 안 죽음).
   * ------------------------------------------------------------------------- */
  async function fetchFinancialData(stock, period = "annual") {
    if (!stock) return;
    const id = stock.id;
    const cacheKey = `${id}_${period}`;
    if (finData[cacheKey]) return; // 이미 조회됨(캐시) → 재호출 차단

    const key = import.meta.env?.VITE_DART_API_KEY;
    const corp = DART_CORP_CODE[id];
    if (!key || !corp) {
      setFinData((prev) => ({ ...prev, [cacheKey]: { values: {}, full: [], year: null, reprt: null } }));
      return;
    }

    const conf = DART_PERIODS[period] || DART_PERIODS.annual;
    const nowY = new Date().getFullYear();

    setFinLoading(true);
    try {
      let result = null;

      // (연도 × 보고서 × 재무구분) 후보를 최신순으로 시도 → 데이터 있는 첫 조합 사용
      outer: for (const year of conf.years(nowY)) {
        for (const reprt of conf.reprts) {
          for (const fsDiv of ["CFS", "OFS"]) {
            // CFS=연결 우선, 없으면 OFS=개별 폴백
            const url =
              `${DART_BASE}/api/fnlttSinglAcntAll.json` +
              `?crtfc_key=${encodeURIComponent(key)}` +
              `&corp_code=${encodeURIComponent(corp)}` +
              `&bsns_year=${year}` +
              `&reprt_code=${reprt}` +
              `&fs_div=${fsDiv}`; // 필수값 (없으면 status 100 거부)

            const res = await fetch(url, { method: "GET", mode: "cors" });
            if (!res.ok) {
              console.warn("[DART]", id, year, reprt, fsDiv, "HTTP", res.status);
              continue;
            }
            const json = await res.json();
            if (json.status !== "000") {
              console.warn("[DART]", id, year, reprt, fsDiv, json.status, json.message);
              continue;
            }

            const list = Array.isArray(json.list) ? json.list : [];
            const scoped = list; // fs_div 로 이미 연결/개별이 결정됨

            const norm = (v) => String(v || "").replace(/\s/g, "");
            const find = (names, sjs) => {
              const it = scoped.find(
                (x) => sjs.includes(x.sj_div) && names.some((nm) => norm(x.account_nm).includes(nm))
              );
              return it ? fmtDartAmount(it.thstrm_amount) : null;
            };

            const values = {};
            const set = (k, v) => { if (v) values[k] = v; };
            set("자산총계", find(["자산총계"], ["BS"]));
            set("부채총계", find(["부채총계"], ["BS"]));
            set("자본총계", find(["자본총계"], ["BS"]));
            set("매출액", find(["매출액", "수익(매출액)", "영업수익"], ["IS", "CIS"]));
            set("영업이익", find(["영업이익"], ["IS", "CIS"]));
            set("당기순이익", find(["당기순이익"], ["IS", "CIS"]));

            // 최근 3개년 매출 추이 (당기/전기/전전기) — 조 단위, 오래된→최신 순
            let revenue = null;
            const salesItem = scoped.find(
              (x) =>
                ["IS", "CIS"].includes(x.sj_div) &&
                ["매출액", "수익(매출액)", "영업수익"].some((nm) => norm(x.account_nm).includes(nm))
            );
            if (salesItem) {
              const toJo = (raw) => {
                const n = parseFloat(String(raw || "").replace(/,/g, ""));
                return isFinite(n) ? Math.round(n / 1e12) : null;
              };
              const arr = [
                { year: String(year - 2), value: toJo(salesItem.bfefrmtrm_amount) },
                { year: String(year - 1), value: toJo(salesItem.frmtrm_amount) },
                { year: String(year), value: toJo(salesItem.thstrm_amount) },
              ].filter((r) => r.value != null && r.value > 0);
              if (arr.length >= 2) revenue = arr;
            }

            // 전체 재무제표(모든 계정과목)
            const full = scoped
              .map((x) => ({ sj: x.sj_div, name: x.account_nm, amount: fmtDartAmount(x.thstrm_amount) }))
              .filter((x) => x.name && x.amount);

            if (Object.keys(values).length > 0 || full.length > 0) {
              result = { values, full, year, reprt, revenue };
              break outer;
            }
          }
        }
      }

      setFinData((prev) => ({
        ...prev,
        [cacheKey]: result || { values: {}, full: [], year: null, reprt: null },
      }));
    } catch (err) {
      console.error("[DART] 조회 실패:", id, err);
      setFinData((prev) => ({ ...prev, [cacheKey]: { values: {}, full: [], year: null, reprt: null } }));
    } finally {
      setFinLoading(false);
    }
  }

  // 연간/분기 전환
  const switchDartPeriod = (p) => {
    setDartPeriod(p);
    setFullOpen(false);
    if (selected) fetchFinancialData(selected, p);
  };

  /* ----- 화면: 인라인 렌더 함수 (검색 input 포커스 유지 위해 컴포넌트화하지 않음) ----- */

  function renderHome() {
    const aiActive = aiStocks !== null;
    const homeList = aiActive ? aiStocks : filtered;
    return (
      <div style={{ padding: "8px 20px 24px" }}>
        <div style={{ paddingTop: 8, paddingBottom: 20 }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: theme.text, letterSpacing: "-0.03em", lineHeight: 1.25 }}>
            무엇을 찾고 있나요?
          </div>
          <div style={{ fontSize: 14, color: theme.sub, marginTop: 6 }}>AI에게 조건을 말하듯 입력해 보세요</div>
        </div>

        {/* 대형 AI 검색창 */}
        <div
          className="flex items-center gap-3"
          style={{
            backgroundColor: theme.surface,
            borderRadius: 18,
            padding: "16px 18px",
            boxShadow: dark ? "none" : "0 6px 24px rgba(0,80,255,0.08)",
            border: `1.5px solid ${query ? BRAND : "transparent"}`,
            transition: "border-color .15s",
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
            <circle cx="11" cy="11" r="7" stroke={BRAND} strokeWidth="2" />
            <path d="M20 20l-3.2-3.2" stroke={BRAND} strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                runGeminiSearch();
              }
            }}
            placeholder="예: 3년 우상향 반도체"
            style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 17, fontWeight: 600, color: theme.text }}
          />
          {query && !aiLoading && (
            <button onClick={clearQuery} style={{ flexShrink: 0 }} aria-label="지우기">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" fill={theme.chip} />
                <path d="M9 9l6 6M15 9l-6 6" stroke={theme.sub} strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>

        {/* 추천 키워드 칩 */}
        <div className="flex flex-wrap gap-2" style={{ marginTop: 14 }}>
          {SUGGEST_CHIPS.map((c) => {
            const on = query.includes(c);
            return (
              <button
                key={c}
                onClick={() => onQueryChange(on ? query.replace(c, "").replace(/\s+/g, " ").trim() : query ? query + " " + c : c)}
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  padding: "8px 14px",
                  borderRadius: 999,
                  color: on ? "#fff" : theme.text,
                  backgroundColor: on ? BRAND : theme.surface,
                  border: `1px solid ${on ? BRAND : theme.line}`,
                }}
              >
                {c}
              </button>
            );
          })}
        </div>

        {/* AI 검색 실행 버튼 */}
        <button
          onClick={runGeminiSearch}
          disabled={!query.trim() || aiLoading}
          className="flex items-center justify-center gap-2"
          style={{
            width: "100%",
            marginTop: 16,
            padding: 15,
            borderRadius: 14,
            fontSize: 15,
            fontWeight: 700,
            color: "#fff",
            backgroundColor: !query.trim() || aiLoading ? (dark ? "#1c2740" : BRAND_LIGHT) : BRAND,
            transition: "background-color .15s",
          }}
        >
          {aiLoading ? (
            <>
              <span className="pg-spin" style={{ width: 16, height: 16, borderRadius: "50%", border: "2.5px solid rgba(255,255,255,0.35)", borderTopColor: "#fff", display: "inline-block" }} />
              AI 분석 중...
            </>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M12 3l1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" fill="#fff" />
                <circle cx="18.5" cy="17.5" r="1.6" fill="#fff" />
              </svg>
              AI로 종목 찾기
            </>
          )}
        </button>

        {/* AI 분석 중 스피너 (검색창 하단) */}
        {aiLoading && (
          <div
            className="flex items-center gap-3"
            style={{ marginTop: 14, padding: "16px 18px", backgroundColor: theme.surface, borderRadius: 16 }}
          >
            <span className="pg-spin" style={{ width: 22, height: 22, borderRadius: "50%", border: `2.5px solid ${theme.line}`, borderTopColor: BRAND, display: "inline-block", flexShrink: 0 }} />
            <div className="min-w-0">
              <div style={{ fontSize: 14.5, fontWeight: 700, color: theme.text }}>AI가 종목을 분석하고 있어요</div>
              <div style={{ fontSize: 12.5, color: theme.sub, marginTop: 2 }}>
                Gemini가 조건에 맞는 종목을 선별 중<span className="pg-dots" />
              </div>
            </div>
          </div>
        )}

        {/* 에러 안내 (부드럽게) */}
        {aiError && !aiLoading && (
          <div
            className="flex items-center gap-3"
            style={{ marginTop: 14, padding: "16px 18px", backgroundColor: dark ? "#2a1a1d" : "#fff1f2", borderRadius: 16, border: `1px solid ${dark ? "#46232a" : "#ffd9dd"}` }}
          >
            <span style={{ fontSize: 18, flexShrink: 0 }}>⚠️</span>
            <div className="flex-1 min-w-0">
              <div style={{ fontSize: 14, fontWeight: 700, color: UP }}>{aiError}</div>
              <div style={{ fontSize: 12.5, color: theme.sub, marginTop: 2 }}>잠시 후 다시 시도해 주세요.</div>
            </div>
            <button onClick={runGeminiSearch} style={{ flexShrink: 0, fontSize: 13, fontWeight: 700, color: BRAND, padding: "6px 12px", borderRadius: 10, backgroundColor: theme.chip }}>
              재시도
            </button>
          </div>
        )}

        {/* 스크리너 / AI 추천 리스트 */}
        <div className="flex items-center justify-between" style={{ marginTop: 26, marginBottom: 4 }}>
          <span className="flex items-center gap-2" style={{ fontSize: 17, fontWeight: 800, color: theme.text }}>
            {aiActive ? (
              <>
                <span style={{ color: BRAND }}>✨</span> AI 추천 결과
              </>
            ) : (
              "실시간 유망 종목"
            )}
          </span>
          {aiActive ? (
            <button onClick={clearQuery} style={{ fontSize: 13, color: theme.sub, fontWeight: 600 }}>
              초기화
            </button>
          ) : (
            <span style={{ fontSize: 13, color: theme.sub, fontWeight: 600 }}>{filtered.length}개</span>
          )}
        </div>

        {/* 실시간 시세 상태 */}
        {!aiActive && (
          <div className="flex items-center" style={{ gap: 6, marginBottom: 6 }}>
            {priceLoading ? (
              <>
                <span className="pg-spin" style={{ width: 11, height: 11, borderRadius: "50%", border: `2px solid ${theme.line}`, borderTopColor: BRAND, display: "inline-block" }} />
                <span style={{ fontSize: 12, color: theme.sub }}>실시간 시세 불러오는 중<span className="pg-dots" /></span>
              </>
            ) : (
              <>
                <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: priceLive ? "#1ec07a" : theme.sub, display: "inline-block" }} />
                <span style={{ fontSize: 12, color: theme.sub }}>
                  {priceLive ? "실시간 시세 반영됨 · 한국투자증권" : "기준 시세 표시 중 (실시간 미연결)"}
                </span>
              </>
            )}
          </div>
        )}

        <div>
          {homeList.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 0", color: theme.sub }}>
              <div style={{ fontSize: 34, marginBottom: 8 }}>{aiActive ? "🤖" : "🔍"}</div>
              {aiActive ? "AI가 조건에 맞는 종목을 찾지 못했어요" : "조건에 맞는 종목이 없어요"}
            </div>
          ) : (
            homeList.map((s, i) => (
              <div key={s.id} style={{ borderTop: i === 0 ? "none" : `1px solid ${theme.line}` }}>
                <StockRow stock={s} theme={theme} starred={stars.includes(s.id)} onToggleStar={() => toggleStar(s.id)} onOpen={() => openStock(s)} loading={priceLoading} />
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  function renderWatchlist() {
    const sectorCount = {};
    starredStocks.forEach((s) => {
      sectorCount[s.sector] = (sectorCount[s.sector] || 0) + 1;
    });
    const total = starredStocks.length || 1;
    const sectorArr = Object.entries(sectorCount)
      .map(([name, cnt]) => ({ name, pct: Math.round((cnt / total) * 100) }))
      .sort((a, b) => b.pct - a.pct);
    const top = sectorArr[0];
    const concentrated = top && top.pct >= 50 && starredStocks.length >= 2;
    const palette = [BRAND, "#6aa0ff", "#9cc0ff", "#c9d6ff"];

    return (
      <div style={{ padding: "8px 20px 24px" }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: theme.text, letterSpacing: "-0.03em", padding: "12px 0 4px" }}>
          내 관심종목
        </div>
        <div style={{ fontSize: 14, color: theme.sub, marginBottom: 12 }}>별표로 찜한 {starredStocks.length}개 종목</div>

        {starredStocks.length === 0 ? (
          <div style={{ textAlign: "center", padding: "56px 24px", backgroundColor: theme.surface, borderRadius: 18, color: theme.sub, marginTop: 20 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⭐</div>
            <div style={{ fontWeight: 700, color: theme.text, marginBottom: 6 }}>아직 담은 종목이 없어요</div>
            <div style={{ fontSize: 14, lineHeight: 1.5 }}>
              홈에서 관심 있는 종목의 별표를 눌러
              <br />
              나만의 포트폴리오를 만들어 보세요
            </div>
          </div>
        ) : (
          <>
            <div style={{ backgroundColor: theme.surface, borderRadius: 18, padding: "4px 16px", overflow: "hidden" }}>
              {starredStocks.map((s, i) => (
                <div key={s.id} style={{ borderTop: i === 0 ? "none" : `1px solid ${theme.line}` }}>
                  <StockRow stock={s} theme={theme} starred onToggleStar={() => toggleStar(s.id)} onOpen={() => openStock(s)} loading={priceLoading} />
                </div>
              ))}
            </div>

            {/* AI 포트폴리오 정밀 진단 */}
            <div
              style={{
                marginTop: 18,
                borderRadius: 18,
                padding: 20,
                background: dark ? "linear-gradient(135deg,#11203f,#0b0e14)" : "linear-gradient(135deg,#eaf0ff,#f7f9ff)",
                border: `1px solid ${dark ? "#1d3a6b" : "#dbe5ff"}`,
              }}
            >
              <div className="flex items-center gap-2" style={{ marginBottom: 14 }}>
                <span style={{ fontSize: 18 }}>🤖</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: theme.text }}>AI 포트폴리오 정밀 진단</span>
              </div>

              <div style={{ marginBottom: 14 }}>
                <div className="flex" style={{ height: 12, borderRadius: 999, overflow: "hidden", backgroundColor: theme.line }}>
                  {sectorArr.map((s, i) => (
                    <div key={s.name} style={{ width: `${s.pct}%`, backgroundColor: palette[i % 4] }} />
                  ))}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1" style={{ marginTop: 10 }}>
                  {sectorArr.map((s, i) => (
                    <span key={s.name} className="flex items-center gap-1" style={{ fontSize: 12, color: theme.sub }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: palette[i % 4] }} />
                      {s.name} {s.pct}%
                    </span>
                  ))}
                </div>
              </div>

              <div style={{ backgroundColor: dark ? "rgba(255,255,255,0.04)" : "#fff", borderRadius: 12, padding: 14, fontSize: 13.5, lineHeight: 1.6, color: theme.text }}>
                {concentrated ? (
                  <>
                    <b style={{ color: UP }}>⚠️ 자산 편중 경고</b>
                    <br />
                    현재 포트폴리오의 <b>{top.pct}%</b>가 <b>{top.name}</b> 업종에 집중되어 있어요. 해당 산업이 부진할 경우 손실이 커질 수 있습니다.
                    <div style={{ marginTop: 8, color: theme.sub }}>
                      💡 <b style={{ color: BRAND }}>대안 제안:</b> 자동차·바이오 등 경기 방어적 섹터를 추가해 변동성을 낮춰 보세요.
                    </div>
                  </>
                ) : (
                  <>
                    <b style={{ color: BRAND }}>✅ 균형 잡힌 분산</b>
                    <br />
                    여러 업종에 고르게 분산되어 있어 특정 산업 리스크가 낮은 편이에요. 종목 수를 더 늘리면 안정성이 한층 높아집니다.
                  </>
                )}
              </div>
              <div style={{ fontSize: 11, color: theme.sub, marginTop: 10 }}>※ 본 진단은 참고용 정보이며 투자 권유가 아닙니다.</div>
            </div>
          </>
        )}
      </div>
    );
  }

  function renderTest() {
    if (testDone) {
      const winner = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
      const r = TEST_RESULT[winner];
      return (
        <div style={{ padding: "24px 20px 32px", textAlign: "center" }}>
          <div style={{ fontSize: 13, color: BRAND, fontWeight: 700, marginTop: 12 }}>나의 투자 성향은</div>
          <div style={{ fontSize: 64, margin: "12px 0" }}>{r.emoji}</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: theme.text, letterSpacing: "-0.03em" }}>{r.title}</div>
          <div style={{ fontSize: 14.5, color: theme.sub, lineHeight: 1.6, margin: "14px auto 0", maxWidth: 320 }}>{r.desc}</div>

          <div style={{ backgroundColor: theme.surface, borderRadius: 18, padding: 20, marginTop: 24, textAlign: "left" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: theme.text, marginBottom: 14 }}>추천 자산 배분</div>
            {r.alloc.map((a) => (
              <div key={a.name} style={{ marginBottom: 12 }}>
                <div className="flex justify-between" style={{ fontSize: 13.5, fontWeight: 600, color: theme.text, marginBottom: 5 }}>
                  <span>{a.name}</span>
                  <span>{a.pct}%</span>
                </div>
                <div style={{ height: 8, borderRadius: 999, backgroundColor: theme.line, overflow: "hidden" }}>
                  <div style={{ width: `${a.pct}%`, height: "100%", backgroundColor: a.color }} />
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={() => { setStep(0); setScores({ aggressive: 0, neutral: 0, stable: 0 }); setTestDone(false); }}
            style={{ marginTop: 24, width: "100%", padding: 16, borderRadius: 14, backgroundColor: theme.surface, color: theme.text, fontWeight: 700, fontSize: 15, border: `1px solid ${theme.line}` }}
          >
            다시 진단하기
          </button>
        </div>
      );
    }

    const cur = TEST_QUESTIONS[step];
    const progress = (step / TEST_QUESTIONS.length) * 100;
    return (
      <div style={{ padding: "16px 20px 32px" }}>
        <div className="flex items-center gap-3" style={{ marginTop: 8, marginBottom: 28 }}>
          <div style={{ flex: 1, height: 6, borderRadius: 999, backgroundColor: theme.line, overflow: "hidden" }}>
            <div style={{ width: `${progress}%`, height: "100%", backgroundColor: BRAND, transition: "width .3s" }} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: theme.sub }}>{step + 1}/{TEST_QUESTIONS.length}</span>
        </div>

        <div style={{ fontSize: 13, fontWeight: 700, color: BRAND, marginBottom: 10 }}>Q{step + 1}</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: theme.text, lineHeight: 1.4, letterSpacing: "-0.02em", marginBottom: 28 }}>{cur.q}</div>

        <div className="flex flex-col gap-3">
          {cur.options.map((o, idx) => (
            <button
              key={idx}
              onClick={() => {
                setScores((p) => ({ ...p, [o.type]: p[o.type] + 1 }));
                if (step + 1 >= TEST_QUESTIONS.length) setTestDone(true);
                else setStep(step + 1);
              }}
              style={{ textAlign: "left", padding: "18px 18px", borderRadius: 14, backgroundColor: theme.surface, color: theme.text, fontSize: 15.5, fontWeight: 600, border: `1.5px solid ${theme.line}`, lineHeight: 1.4 }}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  function renderSettings() {
    const Section = ({ title, children }) => (
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: theme.sub, padding: "0 4px 8px" }}>{title}</div>
        <div style={{ backgroundColor: theme.surface, borderRadius: 16, overflow: "hidden" }}>{children}</div>
      </div>
    );
    const Row = ({ label, sub, right, last }) => (
      <div className="flex items-center justify-between" style={{ padding: "16px 18px", borderBottom: last ? "none" : `1px solid ${theme.line}` }}>
        <div style={{ paddingRight: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: theme.text }}>{label}</div>
          {sub && <div style={{ fontSize: 12.5, color: theme.sub, marginTop: 3 }}>{sub}</div>}
        </div>
        {right}
      </div>
    );

    return (
      <div style={{ padding: "8px 20px 24px" }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: theme.text, letterSpacing: "-0.03em", padding: "12px 0 20px" }}>설정</div>

        <Section title="알림">
          <Row label="AI 모닝 픽 알림" sub="장 시작 전, 오늘의 추천 종목을 알려드려요" right={<Toggle on={notifMorning} onChange={setNotifMorning} />} />
          <Row label="관심종목 지정가 알림" sub="설정한 목표가 도달 시 푸시 알림" right={<Toggle on={notifPrice} onChange={setNotifPrice} />} last />
        </Section>

        <Section title="화면">
          <Row label="다크모드 고정" sub="앱 전체를 어두운 테마로 표시" right={<Toggle on={dark} onChange={setDark} />} last />
        </Section>

        <Section title="법적 고지">
          <div style={{ padding: "16px 18px" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: theme.text, marginBottom: 8 }}>투자 유의사항 (Disclaimer)</div>
            <div style={{ fontSize: 12.5, color: theme.sub, lineHeight: 1.7 }}>
              본 서비스가 제공하는 종목 정보·AI 분석·스크리닝 결과는 투자 참고 자료일 뿐, 특정 종목의 매수·매도를 권유하는 투자 자문이 아닙니다.
              모든 투자의 최종 판단과 책임은 이용자 본인에게 있으며, 과거의 수익률이 미래의 수익을 보장하지 않습니다.
              본 서비스는 「자본시장과 금융투자업에 관한 법률」상 투자자문업·투자일임업 인가를 받지 않았습니다.
              데이터는 금융감독원 전자공시시스템(Open DART) 등 공개 출처를 활용하나 정확성·완전성을 보증하지 않습니다.
            </div>
          </div>
        </Section>

        <div style={{ textAlign: "center", fontSize: 12, color: theme.sub, marginTop: 8 }}>PICK &amp; GO v1.0 · Closed Prototype</div>
      </div>
    );
  }

  /* 뉴스 탭 (5번째 메뉴): 전 종목 뉴스·공시 통합 타임라인 */
  function renderNews() {
    const feed = [];
    stocks.forEach((s) => {
      (MOCK_NEWS[s.id] || []).forEach((n) => feed.push({ ...n, stock: s }));
    });
    return (
      <div style={{ padding: "8px 20px 24px" }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: theme.text, letterSpacing: "-0.03em", padding: "12px 0 4px" }}>뉴스 · 공시</div>
        <div style={{ fontSize: 14, color: theme.sub, marginBottom: 16 }}>실시간 시장 소식 타임라인</div>

        <div className="flex flex-col gap-2">
          {feed.map((n, i) => {
            const isDart = n.type === "disclosure";
            return (
              <div key={i} onClick={() => openStock(n.stock)} className="flex items-center gap-3 cursor-pointer" style={{ backgroundColor: theme.surface, borderRadius: 14, padding: 14 }}>
                <StockLogo stock={n.stock} size={38} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2" style={{ marginBottom: 3 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: isDart ? BRAND : theme.sub, backgroundColor: theme.chip, padding: "2px 6px", borderRadius: 5 }}>
                      {isDart ? "공시" : "뉴스"}
                    </span>
                    <span style={{ fontSize: 12, color: theme.sub }}>{n.stock.name} · {n.time}</span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: theme.text, lineHeight: 1.4 }} className="truncate">{n.title}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  /* ----- 종목 상세 모달 ----- */
  function renderModal() {
    if (!selected) return null;
    const liveQuote = stocks.find((x) => x.id === selected.id);
    const s = liveQuote
      ? { ...selected, price: liveQuote.price, change: liveQuote.change, changePct: liveQuote.changePct }
      : selected;
    const up = s.change >= 0;
    const c = up ? UP : DOWN;
    const news = MOCK_NEWS[s.id] || [];
    const aiNews = NEWS_AI_SUMMARY[s.id] || [];
    const R = 28;
    const CIRC = 2 * Math.PI * R;

    // DART 실시간 재무 병합: Mock 위에 라이브 값(자산/부채/자본/매출/영업이익/순이익) 덮어쓰기
    const finKey = `${s.id}_${dartPeriod}`;
    const liveFin = finData[finKey]; // undefined=조회전 / {values,full,year,reprt}
    const liveVals = liveFin?.values || null;
    const liveFull = liveFin?.full || []; // 전체 계정과목
    const finYear = liveFin?.year;
    const finReprtLabel = liveFin?.reprt ? REPRT_LABEL[liveFin.reprt] : "";
    const finPending = finLoading && liveFin === undefined; // 이 (종목·기간) 조회 진행 중
    const dispFin = { ...s.financials, ...(liveVals || {}) };
    const LIVE_KEYS = ["자산총계", "부채총계", "자본총계", "매출액", "영업이익", "당기순이익"]; // DART 실시간 대체 항목

    // 매출 추이는 '연간' 본질 → 토글과 무관하게 항상 연간 캐시에서 읽음
    const annualFin = finData[`${s.id}_annual`];
    const dispRevenue = annualFin?.revenue && annualFin.revenue.length >= 2 ? annualFin.revenue : s.revenue;
    const revenueIsLive = !!(annualFin?.revenue && annualFin.revenue.length >= 2);
    const revPending = finLoading && annualFin === undefined; // 연간(차트) 조회 진행 중
    const maxRev = Math.max(...dispRevenue.map((r) => r.value));

    // 구역별 카드 스타일 (가독성 위해 섹션마다 분리)
    const card = { backgroundColor: theme.surface2, border: `1px solid ${theme.line}`, borderRadius: 16, padding: 18, marginBottom: 14 };
    const cardTitle = { fontSize: 14.5, fontWeight: 800, color: theme.text, marginBottom: 12 };

    return (
      <div style={{ position: "absolute", inset: 0, zIndex: 50, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
        <div
          onClick={closeStock}
          style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.45)", opacity: modalShown ? 1 : 0, transition: "opacity .3s ease" }}
        />
        <div
          style={{
            position: "relative",
            backgroundColor: theme.surface,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            height: "92%",
            transform: modalShown ? "translateY(0)" : "translateY(100%)",
            transition: "transform .34s cubic-bezier(.32,.72,0,1)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div style={{ paddingTop: 10, flexShrink: 0 }}>
            <div style={{ width: 40, height: 4, borderRadius: 999, backgroundColor: theme.line, margin: "0 auto" }} />
          </div>

          <div className="flex items-center gap-3" style={{ padding: "16px 20px 14px", flexShrink: 0 }}>
            <StockLogo stock={s} size={48} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 19, fontWeight: 800, color: theme.text }}>{s.name}</span>
                <span style={{ fontSize: 12, color: theme.sub }}>{s.ticker}</span>
              </div>
              <div style={{ marginTop: 2 }}>
                {priceLoading ? (
                  <div className="pg-shimmer" style={{ width: 150, height: 18, borderRadius: 6 }} />
                ) : (
                  <>
                    <span style={{ fontSize: 18, fontWeight: 800, color: theme.text }}>{won(s.price)}원</span>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: c, marginLeft: 8 }}>
                      {up ? "+" : ""}{won(s.change)} ({up ? "+" : ""}{s.changePct}%)
                    </span>
                  </>
                )}
              </div>
            </div>
            <StarButton active={stars.includes(s.id)} theme={theme} onClick={() => toggleStar(s.id)} />
            <button onClick={closeStock} style={{ padding: 4 }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M7 7l10 10M17 7L7 17" stroke={theme.sub} strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div className="flex" style={{ flexShrink: 0, borderBottom: `1px solid ${theme.line}`, padding: "0 20px" }}>
            {[{ k: "ai", label: "AI 진단 & 재무" }, { k: "news", label: "뉴스·공시" }].map((t) => {
              const on = modalTab === t.k;
              return (
                <button key={t.k} onClick={() => setModalTab(t.k)} style={{ flex: 1, padding: "14px 0", fontSize: 14.5, fontWeight: 700, color: on ? theme.text : theme.sub, borderBottom: `2px solid ${on ? BRAND : "transparent"}` }}>
                  {t.label}
                </button>
              );
            })}
          </div>

          <div className="pg-scroll" style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
            {modalTab === "ai" ? (
              <div style={{ padding: "18px 18px 20px", backgroundColor: theme.bg }}>
                {/* 구역 1: AI 종합 점수 */}
                <div className="flex items-center gap-4" style={{ background: dark ? "linear-gradient(135deg,#11203f,#0b0e14)" : "linear-gradient(135deg,#eaf0ff,#f7f9ff)", borderRadius: 16, padding: 18, marginBottom: 14, border: `1px solid ${dark ? "#1d2c4a" : "#dfe8ff"}` }}>
                  <div style={{ position: "relative", width: 64, height: 64, flexShrink: 0 }}>
                    <svg width="64" height="64" viewBox="0 0 64 64">
                      <circle cx="32" cy="32" r={R} fill="none" stroke={theme.line} strokeWidth="7" />
                      <circle cx="32" cy="32" r={R} fill="none" stroke={BRAND} strokeWidth="7" strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - s.aiScore / 100)} transform="rotate(-90 32 32)" />
                    </svg>
                    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, color: BRAND }}>{s.aiScore}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: BRAND }}>AI 종합 점수</div>
                    <div style={{ fontSize: 13.5, color: theme.text, marginTop: 4, lineHeight: 1.5 }}>
                      {s.aiScore >= 85 ? "매우 매력적인 투자 구간" : s.aiScore >= 70 ? "관심을 가질 만한 종목" : "신중한 접근이 필요한 종목"}
                    </div>
                  </div>
                </div>

                {/* 구역 2: AI 추천 사유 */}
                <div style={card}>
                  <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
                    <span style={{ fontSize: 14.5, fontWeight: 800, color: theme.text }}>🤖 AI 추천 사유</span>
                    {s.aiRisk !== undefined && (
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: BRAND, backgroundColor: theme.chip, padding: "2px 7px", borderRadius: 6 }}>
                        Gemini 실시간 분석
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: 14, color: theme.text, lineHeight: 1.7 }}>{s.aiReason}</p>
                </div>

                {/* 구역 3: 주의해야 할 리스크 */}
                <div style={{ ...card, backgroundColor: dark ? "#241519" : "#fff5f5", border: `1px solid ${dark ? "#46232a" : "#ffe0e3"}` }}>
                  <div style={{ fontSize: 14.5, fontWeight: 800, color: theme.text, marginBottom: 10 }}>⚠️ 주의해야 할 리스크</div>
                  <p style={{ fontSize: 14, color: theme.text, lineHeight: 1.7 }}>
                    {s.aiRisk
                      ? s.aiRisk
                      : "시장 전반의 변동성과 업황 사이클에 따라 단기 주가 등락이 발생할 수 있습니다. 분할 매수와 분산 투자를 통해 리스크를 관리하시기 바랍니다."}
                  </p>
                </div>

                {/* 구역 4: 3줄 요약 */}
                <div style={card}>
                  <div style={cardTitle}>3줄 요약</div>
                  {s.aiSummary.map((line, i) => (
                    <div key={i} className="flex gap-2" style={{ marginBottom: i === 2 ? 0 : 8 }}>
                      <span style={{ color: BRAND, fontWeight: 800, flexShrink: 0 }}>{i + 1}</span>
                      <span style={{ fontSize: 13.5, color: theme.text, lineHeight: 1.5 }}>{line}</span>
                    </div>
                  ))}
                </div>

                {/* 구역 5: 최근 3개년 매출 추이 (항상 연간 기준) */}
                <div style={card}>
                  <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
                    <span style={{ fontSize: 14.5, fontWeight: 800, color: theme.text }}>최근 3개년 매출 추이</span>
                    {revenueIsLive && (
                      <span style={{ fontSize: 9.5, fontWeight: 700, color: BRAND, backgroundColor: theme.chip, padding: "1px 6px", borderRadius: 5 }}>
                        DART
                      </span>
                    )}
                  </div>
                  {revPending ? (
                    <div className="flex items-end justify-around" style={{ height: 168, marginTop: 8 }}>
                      {[0, 1, 2].map((i) => (
                        <div key={i} className="flex flex-col items-center justify-end" style={{ flex: 1 }}>
                          <div className="pg-shimmer" style={{ width: 44, height: 60 + i * 24, borderRadius: 8 }} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-end justify-around" style={{ height: 168, marginTop: 8 }}>
                      {dispRevenue.map((r, i) => {
                        const h = (r.value / maxRev) * 104 + 8;
                        return (
                          <div key={r.year} className="flex flex-col items-center justify-end" style={{ flex: 1 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: theme.text, marginBottom: 6 }}>{r.value}조</div>
                            <div style={{ width: 44, height: h, borderRadius: 8, background: i === dispRevenue.length - 1 ? BRAND : dark ? "#2a3656" : "#cdd9ff" }} />
                            <div style={{ fontSize: 12, color: theme.sub, marginTop: 8 }}>{r.year}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* 구역 6: Open DART 전체 재무제표 */}
                <div style={{ ...card, padding: 0, overflow: "hidden" }}>
                  <button
                    onClick={() => setDartOpen((v) => !v)}
                    className="flex items-center justify-center gap-2"
                    style={{ width: "100%", padding: 16, backgroundColor: dartOpen ? theme.surface2 : BRAND, color: dartOpen ? theme.text : "#fff", fontWeight: 700, fontSize: 14 }}
                  >
                    📋 금감원 Open DART 실시간 재무제표 {dartOpen ? "접기" : "열람하기"}
                  </button>

                  {dartOpen && (
                    <div style={{ borderTop: `1px solid ${theme.line}` }}>
                      {/* 연간 / 분기 전환 토글 (재무제표 표에만 적용) */}
                      <div className="flex" style={{ gap: 6, padding: "12px 12px 0" }}>
                        {Object.entries(DART_PERIODS).map(([pk, pc]) => {
                          const on = dartPeriod === pk;
                          return (
                            <button
                              key={pk}
                              onClick={() => switchDartPeriod(pk)}
                              style={{
                                flex: 1,
                                padding: "8px 0",
                                borderRadius: 10,
                                fontSize: 13,
                                fontWeight: 700,
                                color: on ? "#fff" : theme.sub,
                                backgroundColor: on ? BRAND : theme.surface,
                                border: `1px solid ${on ? BRAND : theme.line}`,
                              }}
                            >
                              {pc.label}
                            </button>
                          );
                        })}
                      </div>

                      <div style={{ padding: "10px 14px", fontSize: 12, fontWeight: 700, color: theme.sub }}>
                        {finPending
                          ? "불러오는 중..."
                          : finYear
                          ? `${finYear} ${finReprtLabel} · 연결 기준 (단위: 원)`
                          : "기준 재무 (실시간 미연결)"}
                      </div>

                      {/* 요약 재무 */}
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
                        <tbody>
                          {Object.entries(dispFin).map(([k, v]) => {
                            const isLiveKey = LIVE_KEYS.includes(k);
                            const showLoading = isLiveKey && finPending;
                            const isLiveBound = isLiveKey && liveVals && liveVals[k];
                            const val = showLoading ? "불러오는 중..." : v;
                            const neg = !showLoading && String(v).trim().startsWith("-");
                            return (
                              <tr key={k} style={{ borderTop: `1px solid ${theme.line}` }}>
                                <td style={{ padding: "12px 14px", color: theme.sub, fontWeight: 600, backgroundColor: theme.surface, width: "44%" }}>
                                  <span className="flex items-center gap-1.5">
                                    {k}
                                    {isLiveBound && (
                                      <span style={{ fontSize: 9.5, fontWeight: 700, color: BRAND, backgroundColor: theme.chip, padding: "1px 5px", borderRadius: 5 }}>
                                        DART
                                      </span>
                                    )}
                                  </span>
                                </td>
                                <td style={{ padding: "12px 14px", textAlign: "right", fontWeight: 700, color: showLoading ? theme.sub : neg ? DOWN : theme.text }}>
                                  {val}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>

                      {/* 전체 재무제표 (모든 계정과목) 보기 */}
                      {liveFull.length > 0 && (
                        <>
                          <button
                            onClick={() => setFullOpen((v) => !v)}
                            className="flex items-center justify-center gap-1.5"
                            style={{ width: "100%", padding: "12px 14px", borderTop: `1px solid ${theme.line}`, fontSize: 13, fontWeight: 700, color: BRAND, backgroundColor: theme.surface }}
                          >
                            {fullOpen ? "전체 재무제표 접기 ▲" : `전체 재무제표 보기 (${liveFull.length}개 계정) ▼`}
                          </button>

                          {fullOpen && (
                            <div style={{ maxHeight: 320, overflowY: "auto", borderTop: `1px solid ${theme.line}` }} className="pg-scroll">
                              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                                <tbody>
                                  {liveFull.map((row, i) => {
                                    const neg = String(row.amount).trim().startsWith("-");
                                    const head = i === 0 || liveFull[i - 1].sj !== row.sj;
                                    const sjName = row.sj === "BS" ? "재무상태표" : row.sj === "IS" ? "손익계산서" : row.sj === "CIS" ? "포괄손익계산서" : row.sj === "CF" ? "현금흐름표" : row.sj === "SCE" ? "자본변동표" : row.sj;
                                    return (
                                      <React.Fragment key={row.sj + row.name + i}>
                                        {head && (
                                          <tr>
                                            <td colSpan={2} style={{ padding: "10px 14px 6px", fontSize: 11.5, fontWeight: 800, color: BRAND, backgroundColor: theme.surface2 }}>
                                              {sjName}
                                            </td>
                                          </tr>
                                        )}
                                        <tr style={{ borderTop: `1px solid ${theme.line}` }}>
                                          <td style={{ padding: "9px 14px", color: theme.sub, width: "52%" }}>{row.name}</td>
                                          <td style={{ padding: "9px 14px", textAlign: "right", fontWeight: 600, color: neg ? DOWN : theme.text }}>{row.amount}</td>
                                        </tr>
                                      </React.Fragment>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>

                <div style={{ fontSize: 11, color: theme.sub, marginTop: 4, lineHeight: 1.6, padding: "0 4px" }}>
                  ※ 본 정보는 투자 참고용이며 투자 권유가 아닙니다. 최종 투자 판단의 책임은 이용자 본인에게 있습니다.
                </div>
              </div>
            ) : (
              <div style={{ padding: "20px" }}>
                <div style={{ position: "relative", paddingLeft: 8 }}>
                  {news.map((n, i) => {
                    const isDart = n.type === "disclosure";
                    return (
                      <div key={i} className="flex gap-3" style={{ position: "relative", paddingBottom: i === news.length - 1 ? 0 : 18 }}>
                        <div className="flex flex-col items-center" style={{ flexShrink: 0 }}>
                          <span style={{ width: 11, height: 11, borderRadius: "50%", backgroundColor: isDart ? BRAND : theme.sub, marginTop: 4 }} />
                          {i !== news.length - 1 && <span style={{ flex: 1, width: 2, backgroundColor: theme.line, marginTop: 2 }} />}
                        </div>
                        <div style={{ flex: 1, paddingBottom: 4 }}>
                          <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
                            <span style={{ fontSize: 10.5, fontWeight: 700, color: isDart ? BRAND : theme.sub, backgroundColor: theme.chip, padding: "2px 6px", borderRadius: 5 }}>
                              {isDart ? "공시" : "뉴스"}
                            </span>
                            <span style={{ fontSize: 12, color: theme.sub }}>{n.source} · {n.time}</span>
                          </div>
                          <div style={{ fontSize: 14.5, fontWeight: 600, color: theme.text, lineHeight: 1.45 }}>{n.title}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ marginTop: 22, borderRadius: 16, padding: 18, background: dark ? "linear-gradient(135deg,#11203f,#0b0e14)" : "linear-gradient(135deg,#eaf0ff,#f7f9ff)", border: `1px solid ${dark ? "#1d3a6b" : "#dbe5ff"}` }}>
                  <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
                    <span style={{ fontSize: 16 }}>🤖</span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: theme.text }}>AI가 3줄로 요약했어요</span>
                  </div>
                  {aiNews.map((line, i) => (
                    <div key={i} className="flex gap-2" style={{ marginBottom: i === aiNews.length - 1 ? 0 : 8 }}>
                      <span style={{ color: BRAND, fontWeight: 800, flexShrink: 0 }}>•</span>
                      <span style={{ fontSize: 13.5, color: theme.text, lineHeight: 1.5 }}>{line}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ----- 하단 내비게이션 ----- */
  const NAV = [
    { k: "home", label: "홈", icon: (a) => (<path d="M3 11l9-7 9 7M5 10v9h5v-5h4v5h5v-9" stroke={a ? BRAND : theme.sub} strokeWidth="1.8" strokeLinejoin="round" fill="none" />) },
    { k: "watchlist", label: "관심종목", icon: (a) => (<path d="M12 3.5l2.7 5.5 6 .9-4.3 4.2 1 6L12 17.3 6.6 20.1l1-6L3.3 9.9l6-.9z" stroke={a ? BRAND : theme.sub} strokeWidth="1.7" strokeLinejoin="round" fill={a ? BRAND : "none"} />) },
    { k: "test", label: "투자성향", icon: (a) => (<><path d="M12 3a9 9 0 100 18 9 9 0 000-18z" stroke={a ? BRAND : theme.sub} strokeWidth="1.7" fill="none" /><path d="M9.5 9.5a2.5 2.5 0 113.4 2.3c-.7.3-1 .8-1 1.5v.5" stroke={a ? BRAND : theme.sub} strokeWidth="1.7" strokeLinecap="round" fill="none" /><circle cx="11.9" cy="16.5" r="1" fill={a ? BRAND : theme.sub} /></>) },
    { k: "news", label: "뉴스", icon: (a) => (<><rect x="3.5" y="5" width="17" height="14" rx="2" stroke={a ? BRAND : theme.sub} strokeWidth="1.7" fill="none" /><path d="M7 9h6M7 12h10M7 15h10" stroke={a ? BRAND : theme.sub} strokeWidth="1.6" strokeLinecap="round" /></>) },
    { k: "settings", label: "설정", icon: (a) => (<><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" stroke={a ? BRAND : theme.sub} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" /><circle cx="12" cy="12" r="3" stroke={a ? BRAND : theme.sub} strokeWidth="1.6" fill="none" /></>) },
  ];

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#e5e8eb",
        fontFamily: 'Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", "Segoe UI", Roboto, sans-serif',
      }}
    >
      <style>{`
        *{box-sizing:border-box;-webkit-tap-highlight-color:transparent;margin:0;padding:0;}
        button{cursor:pointer;background:none;border:none;font-family:inherit;}
        input::placeholder{color:#b0b8c1;}
        .pg-scroll::-webkit-scrollbar{width:0;height:0;}
        .pg-scroll{-ms-overflow-style:none;scrollbar-width:none;}
        @keyframes pg-spin{to{transform:rotate(360deg);}}
        .pg-spin{animation:pg-spin .7s linear infinite;}
        @keyframes pg-dots{0%{content:"";}25%{content:".";}50%{content:"..";}75%,100%{content:"...";}}
        .pg-dots::after{content:"";animation:pg-dots 1.4s steps(1) infinite;}
        button:disabled{cursor:default;}
        @keyframes pg-shimmer{0%{background-position:-200px 0;}100%{background-position:200px 0;}}
        .pg-shimmer{background:linear-gradient(90deg,rgba(150,160,175,0.12) 25%,rgba(150,160,175,0.28) 37%,rgba(150,160,175,0.12) 63%);background-size:400px 100%;animation:pg-shimmer 1.3s ease-in-out infinite;}
        /* --- Tailwind 유틸 shim: 프로젝트 Tailwind 설정과 무관하게 레이아웃 보장 --- */
        .flex{display:flex;}
        .flex-col{flex-direction:column;}
        .flex-1{flex:1 1 0%;}
        .flex-wrap{flex-wrap:wrap;}
        .flex-shrink-0{flex-shrink:0;}
        .min-w-0{min-width:0;}
        .items-center{align-items:center;}
        .items-end{align-items:flex-end;}
        .items-start{align-items:flex-start;}
        .justify-center{justify-content:center;}
        .justify-between{justify-content:space-between;}
        .justify-end{justify-content:flex-end;}
        .justify-around{justify-content:space-around;}
        .gap-1{gap:4px;}
        .gap-1\\.5{gap:6px;}
        .gap-2{gap:8px;}
        .gap-3{gap:12px;}
        .gap-4{gap:16px;}
        .rounded-full{border-radius:9999px;}
        .truncate{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
        .font-bold{font-weight:700;}
        .font-medium{font-weight:500;}
        .cursor-pointer{cursor:pointer;}
      `}</style>

      {/* 화면 프레임 (외부 베젤 없음) */}
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 412,
          height: "100vh",
          maxHeight: 880,
          backgroundColor: theme.bg,
          overflow: "hidden",
          borderRadius: 44,
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 24px 70px rgba(0,0,0,0.18)",
          flexShrink: 0,
        }}
      >
          {/* 다이내믹 아일랜드 */}
          <div style={{ position: "absolute", top: 11, left: "50%", transform: "translateX(-50%)", width: 120, height: 34, borderRadius: 999, backgroundColor: "#000", zIndex: 100 }} />

          {/* iOS 상태바 */}
          <div className="flex items-center justify-between" style={{ flexShrink: 0, height: 54, padding: "0 30px 0 34px", color: theme.text }}>
            <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.02em" }}>9:41</span>
            <span style={{ display: "flex", gap: 7, alignItems: "center" }}>
              {/* 셀룰러 */}
              <svg width="18" height="12" viewBox="0 0 18 12" fill={theme.text}><rect x="0" y="8" width="3" height="4" rx="1" /><rect x="5" y="5.5" width="3" height="6.5" rx="1" /><rect x="10" y="3" width="3" height="9" rx="1" /><rect x="15" y="0.5" width="3" height="11.5" rx="1" /></svg>
              {/* 와이파이 */}
              <svg width="17" height="12" viewBox="0 0 17 12" fill={theme.text}><path d="M8.5 2.2c2.6 0 5 1 6.8 2.7l1.4-1.5C14.5 1.2 11.6 0 8.5 0 5.4 0 2.5 1.2.3 3.4l1.4 1.5C3.5 3.2 5.9 2.2 8.5 2.2Z" /><path d="M8.5 6c1.4 0 2.7.5 3.7 1.5l1.4-1.5C12.2 4.7 10.4 4 8.5 4 6.6 4 4.8 4.7 3.4 6l1.4 1.5C5.8 6.5 7.1 6 8.5 6Z" /><path d="M8.5 9.8 10.6 7.6C10.1 7 9.3 6.6 8.5 6.6c-.8 0-1.6.4-2.1 1L8.5 9.8Z" /></svg>
              {/* 배터리 */}
              <span style={{ display: "flex", alignItems: "center", gap: 2 }}>
                <span style={{ display: "block", width: 24, height: 12, borderRadius: 3, border: `1px solid ${theme.text}`, opacity: 0.95, padding: 1.5 }}>
                  <span style={{ display: "block", width: "80%", height: "100%", borderRadius: 1.5, backgroundColor: theme.text }} />
                </span>
                <span style={{ width: 1.5, height: 4, borderRadius: 1, backgroundColor: theme.text, opacity: 0.5 }} />
              </span>
            </span>
          </div>

          {/* 앱 헤더 (PICK & GO) */}
          <div style={{ flexShrink: 0, backgroundColor: theme.bg, padding: "0 20px 8px" }}>
            <div className="flex items-center gap-2">
              <div style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: BRAND, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 14 }}>P</div>
              <span style={{ fontSize: 19, fontWeight: 800, color: theme.text, letterSpacing: "-0.03em" }}>
                PICK <span style={{ color: BRAND }}>&amp;</span> GO
              </span>
            </div>
          </div>

        {/* 본문 */}
        <div className="pg-scroll" style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
          {tab === "home" && renderHome()}
          {tab === "watchlist" && renderWatchlist()}
          {tab === "test" && renderTest()}
          {tab === "news" && renderNews()}
          {tab === "settings" && renderSettings()}
        </div>

        {/* 하단 내비게이션 */}
        <div
          style={{
            flexShrink: 0,
            display: "flex",
            backgroundColor: theme.navBg,
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            borderTop: `1px solid ${theme.line}`,
            paddingBottom: 22,
          }}
        >
          {NAV.map((n) => {
            const active = tab === n.k;
            return (
              <button key={n.k} onClick={() => setTab(n.k)} className="flex flex-col items-center justify-center gap-1" style={{ flex: 1, paddingTop: 9, paddingBottom: 5 }}>
                <svg width="24" height="24" viewBox="0 0 24 24">{n.icon(active)}</svg>
                <span style={{ fontSize: 10.5, fontWeight: active ? 700 : 500, color: active ? BRAND : theme.sub }}>{n.label}</span>
              </button>
            );
          })}
        </div>

        {/* 종목 상세 모달 */}
        {renderModal()}

        {/* 홈 인디케이터 */}
        <div style={{ position: "absolute", bottom: 8, left: "50%", transform: "translateX(-50%)", width: 134, height: 5, borderRadius: 999, backgroundColor: theme.text, opacity: 0.85, zIndex: 110, pointerEvents: "none" }} />
      </div>
    </div>
  );
}