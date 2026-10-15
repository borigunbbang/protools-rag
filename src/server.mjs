import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { search, WEAK_THRESHOLD } from "./search.mjs";
import { SYSTEM_MESSAGE, buildPrompt } from "./prompt.mjs";
import { pingOllama, chatStream } from "./ollama.mjs";

const PORT = 3000;

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

// 질문 하나를 처리하며 진행 상황을 한 줄짜리 JSON(NDJSON)으로 흘려보낸다.
async function handleAsk(req, res) {
  const { question } = JSON.parse(await readBody(req));
  res.writeHead(200, { "Content-Type": "application/x-ndjson; charset=utf-8" });
  const send = (obj) => res.write(JSON.stringify(obj) + "\n");

  if (!question?.trim()) {
    send({ type: "error", message: "질문을 입력하세요." });
    return res.end();
  }
  if (!(await pingOllama())) {
    send({ type: "error", message: "Ollama가 실행 중인지 확인하세요. (터미널: open -a Ollama)" });
    return res.end();
  }

  const t0 = Date.now();
  const hits = await search(question, 3);
  const searchSec = (Date.now() - t0) / 1000;
  const weak = hits[0].score < WEAK_THRESHOLD;
  send({
    type: "hits",
    weak,
    threshold: WEAK_THRESHOLD,
    hits: hits.map(({ id, score, section, url }) => ({ id, score, section, url })),
  });

  const t1 = Date.now();
  const answer = await chatStream(
    [
      { role: "system", content: SYSTEM_MESSAGE },
      { role: "user", content: buildPrompt(question, hits) },
    ],
    (token) => send({ type: "token", text: token })
  );
  send({
    type: "done",
    cited: hits.filter((h) => answer.includes(h.id)).map((h) => h.id),
    searchSec,
    answerSec: (Date.now() - t1) / 1000,
  });
  res.end();
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(readFileSync("web/index.html"));
    }
    if (req.method === "GET" && req.url === "/docs/sop.md") {
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end(readFileSync("docs/sop.md"));
    }
    if (req.method === "POST" && req.url === "/api/ask") return await handleAsk(req, res);
    res.writeHead(404).end();
  } catch (err) {
    if (!res.headersSent) res.writeHead(500, { "Content-Type": "application/x-ndjson; charset=utf-8" });
    res.end(JSON.stringify({ type: "error", message: err.message }) + "\n");
  }
});

await search("준비", 1); // 임베딩 모델을 처음 한 번만 불러온다
server.listen(PORT, "127.0.0.1", () => {
  console.log(`Pro Tools 챗봇: http://localhost:${PORT} (끝내려면 이 창에서 Ctrl+C)`);
});
