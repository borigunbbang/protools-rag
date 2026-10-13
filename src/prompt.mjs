import { WEAK_THRESHOLD } from "./search.mjs";

export const SYSTEM_MESSAGE =
  "당신은 Pro Tools 초보 사용자의 질문에 답하는 안내 도우미입니다. " +
  "주어진 자료(공식 매뉴얼, 위키백과, 작업 SOP)에 근거한 내용만 답하고, 근거가 없으면 '관련 자료를 찾지 못했습니다'라고 답합니다. " +
  "실시간 세션 정보나 범위 밖 주제(플러그인 추천, 구매·라이선스)를 물으면 '이 챗봇은 Pro Tools 사용법만 안내합니다'라고 답합니다. " +
  "다른 DAW에 대한 질문에는 '이 챗봇은 Pro Tools 사용법만 안내합니다'라고 말한 뒤, 자료에 Pro Tools 기준 내용이 있으면 그것으로 답하고 없으면 '관련 자료를 찾지 못했습니다'라고 덧붙입니다. " +
  "용어는 용어명과 설명을 함께 적고, 초보자 기준으로 단계별로 설명하며, 근거 조각의 ID만 [PT-008]처럼 대괄호로 감싸 해당 문장 끝에 표시합니다.";

function nowKST() {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date());
}

export function buildPrompt(question, hits) {
  const weak = hits[0].score < WEAK_THRESHOLD;
  const lines = [
    "다음 자료는 Pro Tools 공식 매뉴얼, 위키백과 공개 문서, 작업 SOP에서 뽑은 조각입니다.",
    weak
      ? "주의: 검색된 조각의 유사도가 낮습니다. 질문과 완전히 맞는 근거가 아닐 수 있으니, 근거에 있는 내용만 짧게 답하고 자료에 없는 부분은 '관련 자료를 찾지 못했습니다'라고 말합니다."
      : "자료에 근거한 내용만 답하고, 자료에 없으면 '관련 자료를 찾지 못했습니다'라고 말합니다.",
    "근거가 된 조각의 ID만 [PT-008]처럼 대괄호로 감싸 해당 문장 끝에 표시합니다.",
    `현재 시각은 ${nowKST()}(KST)입니다. '지금', '올해', '다음 주' 같은 상대 표현은 이 시각을 기준으로 해석합니다.`,
    "",
    "[자료]",
    hits.map((h) => `[${h.id}] (${h.section}) ${h.text}`).join("\n\n"),
    "",
    "[질문]",
    question,
    "",
    "(답할 때 근거로 쓴 자료의 ID를 [PT-008]처럼 문장 끝에 붙입니다.)",
  ];
  return lines.join("\n");
}
