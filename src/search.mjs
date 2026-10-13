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

function bar(score) {
  const n = Math.max(0, Math.min(20, Math.round(score * 20)));
  return "█".repeat(n) + "░".repeat(20 - n);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  let k = 3;
  const questions = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--k") k = Number(args[++i]);
    else questions.push(args[i]);
  }
  if (!questions.length) {
    console.log('사용법: node src/search.mjs "질문1" ["질문2" …] [--k 3]');
    process.exit(1);
  }
  loadStore();
  for (const question of questions) {
    const results = await search(question, k);
    const weak = results[0].score < WEAK_THRESHOLD ? `  ⚠ 관련 자료가 약함(<${WEAK_THRESHOLD})` : "";
    console.log(`\nQ: ${question}${weak}`);
    results.forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.id}  ${r.score.toFixed(3)}  ${bar(r.score)}  [${r.section}]`);
      console.log(`     ${r.text.slice(0, 60)}…`);
      console.log(`     출처: ${r.url}`);
    });
  }
}
