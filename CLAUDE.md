# Pro Tools 사용법 안내 챗봇

## 제품
- Pro Tools로 음악·음향 작업을 하는 사람이 질문이 생길 때마다 매번 매뉴얼을 찾아봐야 해서 불편하다.
  질문하면 Avid가 공식으로 올린 Pro Tools 매뉴얼, 위키백과 공개 문서, 교육용 작업 SOP(docs/sop.md)를 근거로 안내해 주는 챗봇.
- 1단계: 질문과 관련된 매뉴얼 조각을 찾아서 보여 준다. 2단계: 찾은 조각들을 LLM에 넣어서 답을 받는다.

## 비목표
- 웹 화면, 서버, 배포는 안 한다.
- Pro Tools 세션 정보를 실시간으로 조회하거나 직접 조작하는 기능은 안 한다.
- 플러그인 추천, 구매·라이선스 상담, 다른 DAW 사용법 안내는 안 한다.

## 환경
- 내 PC(Mac)에서만 돌린다. Node.js로 만들고 터미널(zsh)에서 실행. LLM은 Ollama의 qwen3.5:2b.

## 작업 규칙
- 내가 요청한 것만 만든다.
- 매뉴얼에 없는 사실이나 URL·메뉴 이름은 지어내지 않는다.
- 질문한 것에만 답하고, 모르는 질문은 추측하거나 지어내지 않는다.

## 데이터 계약
- 청크 원본은 data/chunks.json, 배열이고 각 항목은 { id, text, url, section }.
- id는 PT-001부터 연속, 한 번 붙인 id의 뜻은 바꾸지 않는다. 청크를 빼도 번호를 다시 매기지 않는다.
- text는 최소 120자, 사실 하나. 매뉴얼 원문에 없는 말을 보태지 않는다.
- url은 확인 가능한 출처. 웹 문서는 실제 주소, PDF 매뉴얼은 PDF주소#page=쪽번호.
- section은 짧은 주제명 + 버전, 예: "바운스 (2024.10)".
- 출처: 공식 매뉴얼 PDF 청크 12개 + 위키백과 청크 7개(section 앞에 "위키백과:") + SOP 청크 3개(section 앞에 "SOP:", url은 docs/sop.md#제목, 공백은 하이픈). 웹 주소는 퍼센트 인코딩.
- 다루는 주제: 녹음 준비, 편집, 바운스와 익스포트, 단축키. 청크는 22개(과제 기준 12~15개보다 많지만 유지하기로 결정, README에 이유 기록).

## 임베딩 계약 (`src/embedder.mjs` 한 곳에서만 정의)
- 모델 onnx-community/embeddinggemma-300m-ONNX, transformers.js pipeline("feature-extraction", MODEL, { dtype: "q8" }),
  호출 옵션 { pooling: "mean", normalize: true }, 768차원.
- 입력 형식: 문서는 "title: " + section + " | text: " + text, 질문은 "task: search result | query: " + question.
- 파이프라인은 한 번만 만들어 재사용. export: embedDocument(chunk), embedQuery(question), MODEL, DTYPE, DIM.
- 벡터 저장소 data/vectors.json은 { model, dtype, dim, createdAt, chunks: [{ id, text, url, section, vector }] }.
  저장소의 model·dtype이 현재 embedder와 다르면 검색을 거부하고 "build-index를 다시 실행하라"고 안내.

## 검색 계약 (`src/search.mjs`)
- 벡터는 정규화되어 있으므로 코사인 유사도 = 내적. 점수 내림차순 top-k(기본 3, --k로 변경).
- 약한 근거 기준 WEAK_THRESHOLD = 0.55는 src/search.mjs에서만 정의·export하고 다른 파일은 import.
  1위 점수가 이보다 낮으면 "관련 자료가 약함" 표시. 결과는 버리지 않는다. 0.55가 맞는지는 STEP 5에서 관찰 후 조정.
- (선택) --hybrid: 코사인 상위 10개 + 겹치지 않는 BM25(k1=1.5, b=0.75) 상위 5개. 토큰화는 소문자화 → [^가-힣a-z0-9]+ 분리 → 2글자 미만·흔한 조사/요청어 제거, tf는 "토큰이 검색어를 포함"으로 센다. BM25 점수는 후보 중 최고점으로 나눠 0~1. 결과에 [vector]/[bm25] 표시. 옵션이 없으면 기본 동작 그대로.
- search.mjs는 직접 실행됐을 때만 CLI를 돈다(import.meta.url === pathToFileURL(process.argv[1]).href).

## 생성 계약 (2단계)
- 시스템 메시지: "당신은 Pro Tools 초보 사용자의 질문에 답하는 안내 도우미입니다. 주어진 자료(공식 매뉴얼, 위키백과, 작업 SOP)에 근거한 내용만 답하고, 근거가 없으면 '관련 자료를 찾지 못했습니다'라고 답합니다. 실시간 세션 정보나 범위 밖 주제(플러그인 추천, 구매·라이선스)를 물으면 '이 챗봇은 Pro Tools 사용법만 안내합니다'라고 답합니다. 다른 DAW에 대한 질문에는 '이 챗봇은 Pro Tools 사용법만 안내합니다'라고 말한 뒤, 자료에 Pro Tools 기준 내용이 있으면 그것으로 답하고 없으면 '관련 자료를 찾지 못했습니다'라고 덧붙입니다. 용어는 용어명과 설명을 함께 적고, 초보자 기준으로 단계별로 설명하며, 근거 조각의 ID만 [PT-008]처럼 대괄호로 감싸 해당 문장 끝에 표시합니다."
- 사용자 메시지 순서: ① 자료 소개 ② 근거 원칙 ③ 출처 규칙 ④ KST 현재 시각
  ⑤ [자료] + "[PT-xxx] (section) text" 줄들(대괄호 안에는 ID만) ⑥ [질문] + 질문 ⑦ 출처 규칙 한 번 더.
- ③ "근거가 된 조각의 ID만 [PT-008]처럼 대괄호로 감싸 해당 문장 끝에 표시합니다."
- ⑦ "(답할 때 근거로 쓴 자료의 ID를 [PT-008]처럼 문장 끝에 붙입니다.)"
- ② 근거 원칙은 1위 점수에 따라 (WEAK_THRESHOLD는 src/search.mjs에서 import):
  · 이상: "자료에 근거한 내용만 답하고, 자료에 없으면 '관련 자료를 찾지 못했습니다'라고 말합니다."
  · 미만: "주의: 검색된 조각의 유사도가 낮습니다. 질문과 완전히 맞는 근거가 아닐 수 있으니, 근거에 있는 내용만 짧게 답하고 자료에 없는 부분은 '관련 자료를 찾지 못했습니다'라고 말합니다."
- LLM: Ollama http://localhost:11434, 모델 qwen3.5:2b, POST /api/chat,
  { model, messages, stream: true, think: false, options: { temperature: 0 } }. 응답은 NDJSON, TextDecoder { stream: true }.
- 근거 표시는 LLM에 맡기지 않는다. 답변 뒤에 LLM에게 넘긴 자료를 모두 보여 주고, 답변에 ID가 적힌 자료에 ✓를 붙인다.
- (선택) 대화형 모드: 질문 없이 node src/ask.mjs [--k 3] [--no-rag]. node:readline만 사용, 시작 시 Ollama 확인과 임베딩 모델 로드를 한 번만. 질문끼리 독립(앞 질문 기억 안 함). exit/quit/Ctrl+C로 종료, 답변 중 오류가 나도 다음 질문을 받는다.
- Ollama 연결 확인은 실제로 LLM을 호출할 때만(--show-prompt는 Ollama 없이 동작). 연결 실패 시 "Ollama가 실행 중인지 확인하세요"와 확인 명령 안내 후 종료.
