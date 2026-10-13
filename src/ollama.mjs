const HOST = "http://localhost:11434";
export const LLM_MODEL = "qwen3.5:2b";

export async function pingOllama() {
  try {
    const res = await fetch(`${HOST}/api/tags`);
    return res.ok;
  } catch {
    return false;
  }
}

export async function chatStream(messages, onToken) {
  const res = await fetch(`${HOST}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: LLM_MODEL, messages, stream: true, think: false, options: { temperature: 0 } }),
  });
  if (!res.ok) throw new Error(`Ollama 오류: ${res.status} ${await res.text()}`);

  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let answer = "";
  for await (const piece of res.body) {
    buffer += decoder.decode(piece, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      const data = JSON.parse(line);
      const token = data.message?.content ?? "";
      if (token) {
        answer += token;
        onToken(token);
      }
    }
  }
  return answer;
}
