import { readFileSync, writeFileSync } from "node:fs";
import { embedDocument, MODEL, DTYPE, DIM } from "./embedder.mjs";

const chunks = JSON.parse(readFileSync("data/chunks.json", "utf8"));

const seen = new Set();
for (const c of chunks) {
  for (const field of ["id", "text", "url", "section"]) {
    if (!c[field]) {
      console.error(`중단: ${c.id ?? "(id 없음)"}에 ${field} 필드가 없습니다.`);
      process.exit(1);
    }
  }
  if (seen.has(c.id)) {
    console.error(`중단: 중복 id ${c.id}`);
    process.exit(1);
  }
  seen.add(c.id);
  if (c.text.length < 120) console.warn(`경고: ${c.id} text가 120자 미만 (${c.text.length}자)`);
}

const out = [];
for (const c of chunks) {
  const vector = await embedDocument(c);
  out.push({ ...c, vector });
  console.log(`✓ ${c.id} (${c.section})`);
}

const bad = out.filter((c) => c.vector.length !== DIM);
if (bad.length) {
  console.error(`중단: ${DIM}차원이 아닌 벡터 ${bad.map((c) => c.id).join(", ")}`);
  process.exit(1);
}

const first = out[0].vector;
const norm = Math.sqrt(first.reduce((s, x) => s + x * x, 0));
console.log(`첫 벡터 앞 5개: [${first.slice(0, 5).map((x) => x.toFixed(4)).join(", ")}]  노름: ${norm.toFixed(4)}`);

writeFileSync(
  "data/vectors.json",
  JSON.stringify({ model: MODEL, dtype: DTYPE, dim: DIM, createdAt: new Date().toISOString(), chunks: out })
);
console.log(`저장: data/vectors.json — ${out.length}청크 × ${DIM}차원`);
