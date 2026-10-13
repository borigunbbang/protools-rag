import { pipeline } from "@huggingface/transformers";

export const MODEL = "onnx-community/embeddinggemma-300m-ONNX";
export const DTYPE = "q8";
export const DIM = 768;

let extractor = null;

async function getExtractor() {
  if (!extractor) {
    console.log("임베딩 모델 불러오는 중…(첫 실행은 다운로드)");
    extractor = await pipeline("feature-extraction", MODEL, { dtype: DTYPE });
  }
  return extractor;
}

async function embed(input) {
  const ex = await getExtractor();
  const output = await ex(input, { pooling: "mean", normalize: true });
  return Array.from(output.data);
}

export function embedDocument(chunk) {
  return embed(`title: ${chunk.section} | text: ${chunk.text}`);
}

export function embedQuery(question) {
  return embed(`task: search result | query: ${question}`);
}
