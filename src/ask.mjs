import { createInterface } from "node:readline";
import { search, WEAK_THRESHOLD } from "./search.mjs";
import { SYSTEM_MESSAGE, buildPrompt } from "./prompt.mjs";
import { pingOllama, chatStream } from "./ollama.mjs";

const args = process.argv.slice(2);
let k = 3;
let question = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--k") k = Number(args[++i]);
  else if (!args[i].startsWith("--")) question = args[i];
}
const showPrompt = args.includes("--show-prompt");
const noRag = args.includes("--no-rag");

async function ensureOllama() {
  if (!(await pingOllama())) {
    console.error("Ollama가 실행 중인지 확인하세요 (확인: curl http://localhost:11434/api/tags)");
    process.exit(1);
  }
}

const write = (t) => process.stdout.write(t);

async function answerNoRag(question) {
  const t0 = Date.now();
  console.log("💬 답변");
  await chatStream([{ role: "user", content: question }], write);
  console.log(`\n⏱ 답변 ${((Date.now() - t0) / 1000).toFixed(1)}초`);
}

async function answerWithRag(question) {
  const t0 = Date.now();
  const hits = await search(question, k);
  const searchSec = (Date.now() - t0) / 1000;
  const user = buildPrompt(question, hits);

  const weak = hits[0].score < WEAK_THRESHOLD;
  console.log("🔎 검색 결과");
  for (const h of hits) console.log(`  ${h.id}  ${h.score.toFixed(3)}  ${h.section}`);
  if (weak) console.log(`  ⚠ 관련 자료가 약함(<${WEAK_THRESHOLD})`);

  const t1 = Date.now();
  console.log("💬 답변");
  const answer = await chatStream(
    [
      { role: "system", content: SYSTEM_MESSAGE },
      { role: "user", content: user },
    ],
    write
  );
  const answerSec = (Date.now() - t1) / 1000;

  console.log("\n📚 근거 (LLM에게 넘긴 자료 · ✓ = 답변에 ID가 표시된 자료)");
  let anyCited = false;
  for (const h of hits) {
    const cited = answer.includes(h.id);
    if (cited) anyCited = true;
    console.log(`  ${cited ? "✓" : " "} ${h.id}  ${h.section}  ${h.url}`);
  }
  if (weak) console.log("  ⚠ 관련 자료가 약해 이 자료들을 답변의 근거로 보기 어렵습니다");
  else if (!anyCited) console.log("  (답변에 ID 표시가 없습니다. 위 자료와 답변을 비교해 확인하세요)");

  console.log(`⏱ 검색 ${searchSec.toFixed(1)}초 · 답변 ${answerSec.toFixed(1)}초`);
}

async function interactive() {
  await ensureOllama();
  await search("준비", 1); // 임베딩 모델을 처음 한 번만 불러온다
  console.log("Pro Tools 사용법 안내 챗봇입니다. 질문을 입력하세요. (끝내려면 exit)");
  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: "\n질문> " });
  // 답변을 기다리는 동안 들어온 줄도 버리지 않도록 줄을 큐에 쌓고 하나씩 처리한다.
  const queue = [];
  let closed = false;
  let wake = null;
  rl.on("line", (line) => {
    queue.push(line);
    wake?.();
  });
  rl.on("close", () => {
    closed = true;
    wake?.();
  });
  rl.prompt();
  while (true) {
    if (!queue.length) {
      if (closed) break;
      await new Promise((resolve) => (wake = resolve));
      wake = null;
      continue;
    }
    const line = queue.shift().trim();
    if (line === "exit" || line === "quit") break;
    if (line) {
      try {
        await (noRag ? answerNoRag(line) : answerWithRag(line));
      } catch (err) {
        console.error(`\n오류가 났습니다: ${err.message}`);
      }
    }
    if (!closed) rl.prompt();
  }
  rl.close();
}

if (!question) {
  if (showPrompt) {
    console.log('사용법: node src/ask.mjs "질문" [--k 3] [--show-prompt] [--no-rag]  (질문 없이 실행하면 대화형 모드)');
    process.exit(1);
  }
  await interactive();
} else if (showPrompt) {
  const hits = await search(question, k);
  console.log("===== [system] =====");
  console.log(SYSTEM_MESSAGE);
  console.log("\n===== [user] =====");
  console.log(buildPrompt(question, hits));
} else {
  await ensureOllama();
  await (noRag ? answerNoRag(question) : answerWithRag(question));
}
