import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { embedQuery, MODEL, DTYPE } from "./embedder.mjs";

export const WEAK_THRESHOLD = 0.55;

let store = null;

function loadStore() {
  if (!store) {
    store = JSON.parse(readFileSync("data/vectors.json", "utf8"));
    if (store.model !== MODEL || store.dtype !== DTYPE) {
      console.error(
        `벡터 저장소(${store.model}, ${store.dtype})와 현재 임베딩 설정(${MODEL}, ${DTYPE})이 다릅니다.\n` +
          "node src/build-index.mjs 를 다시 실행하세요."
      );
      process.exit(1);
    }
  }
  return store;
}

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export async function search(question, k = 3) {
  const { chunks } = loadStore();
  const q = await embedQuery(question);
  return chunks
    .map(({ vector, ...c }) => ({ ...c, score: dot(q, vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

const STOPWORDS = new Set([
  "어떻게", "뭐야", "알려줘", "하는", "하려면", "있어", "무엇", "어떤", "해줘", "방법", "하는법",
  "에서", "으로", "에게", "이랑", "랑", "은", "는", "이", "가", "을", "를", "의", "도",
]);

function tokenize(text) {
  return text
    .toLowerCase()
    .split(/[^가-힣a-z0-9]+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

// BM25(k1=1.5, b=0.75). tf는 "문서 토큰이 검색어를 포함"하는 개수로 센다(한국어 조사 대응).
function bm25(question, chunks, k1 = 1.5, b = 0.75) {
  const qTokens = [...new Set(tokenize(question))];
  const docs = chunks.map((c) => tokenize(`${c.section} ${c.text}`));
  const avgLen = docs.reduce((s, d) => s + d.length, 0) / docs.length;
  const N = docs.length;
  const idf = {};
  for (const q of qTokens) {
    const df = docs.filter((d) => d.some((t) => t.includes(q))).length;
    idf[q] = Math.log(1 + (N - df + 0.5) / (df + 0.5));
  }
  return docs.map((d) => {
    let score = 0;
    for (const q of qTokens) {
      const tf = d.filter((t) => t.includes(q)).length;
      if (tf) score += idf[q] * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * d.length) / avgLen)));
    }
    return score;
  });
}

export async function hybridSearch(question) {
  const { chunks } = loadStore();
  const vectorHits = (await search(question, 10)).map((h) => ({ ...h, source: "vector" }));
  const taken = new Set(vectorHits.map((h) => h.id));
  const scores = bm25(question, chunks);
  const bmHits = chunks
    .map(({ vector, ...c }, i) => ({ ...c, raw: scores[i] }))
    .filter((c) => c.raw > 0 && !taken.has(c.id))
    .sort((a, b) => b.raw - a.raw)
    .slice(0, 5);
  const max = Math.max(...bmHits.map((h) => h.raw), 0);
  return [...vectorHits, ...bmHits.map(({ raw, ...h }) => ({ ...h, score: raw / max, source: "bm25" }))];
}

function bar(score) {
  const n = Math.max(0, Math.min(20, Math.round(score * 20)));
  return "█".repeat(n) + "░".repeat(20 - n);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  let k = 3;
  let hybrid = false;
  const questions = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--k") k = Number(args[++i]);
    else if (args[i] === "--hybrid") hybrid = true;
    else questions.push(args[i]);
  }
  if (!questions.length) {
    console.log('사용법: node src/search.mjs "질문1" ["질문2" …] [--k 3] [--hybrid]');
    process.exit(1);
  }
  loadStore();
  for (const question of questions) {
    const results = hybrid ? await hybridSearch(question) : await search(question, k);
    const weak = results[0].score < WEAK_THRESHOLD ? `  ⚠ 관련 자료가 약함(<${WEAK_THRESHOLD})` : "";
    console.log(`\nQ: ${question}${weak}`);
    results.forEach((r, i) => {
      const tag = hybrid ? `[${r.source}] ` : "";
      console.log(`  ${i + 1}. ${tag}${r.id}  ${r.score.toFixed(3)}  ${bar(r.score)}  [${r.section}]`);
      console.log(`     ${r.text.slice(0, 60)}…`);
      console.log(`     출처: ${r.url}`);
    });
  }
}
