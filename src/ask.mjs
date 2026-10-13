import { search } from "./search.mjs";
import { SYSTEM_MESSAGE, buildPrompt } from "./prompt.mjs";

const args = process.argv.slice(2);
const showPrompt = args.includes("--show-prompt");
const question = args.find((a) => !a.startsWith("--"));

if (!question) {
  console.log('사용법: node src/ask.mjs "질문" [--show-prompt]');
  process.exit(1);
}

const hits = await search(question, 3);
const user = buildPrompt(question, hits);

if (showPrompt) {
  console.log("===== [system] =====");
  console.log(SYSTEM_MESSAGE);
  console.log("\n===== [user] =====");
  console.log(user);
}
