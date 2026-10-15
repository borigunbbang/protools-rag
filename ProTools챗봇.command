#!/bin/zsh
# 더블클릭하면 Ollama를 켜고, 챗봇 서버를 실행하고, 브라우저를 연다. 이 창을 닫으면 챗봇도 꺼진다.
cd "$(dirname "$0")"
URL="http://localhost:3000"

if curl -s -m 2 "$URL" > /dev/null; then
  echo "이미 실행 중입니다. 브라우저를 엽니다."
  open "$URL"
  exit 0
fi

if ! curl -s -m 2 http://localhost:11434/api/tags > /dev/null; then
  echo "Ollama를 켜는 중…"
  open -a Ollama
  for i in {1..20}; do
    curl -s -m 2 http://localhost:11434/api/tags > /dev/null && break
    sleep 1
  done
fi

node src/server.mjs &
SERVER=$!
for i in {1..60}; do
  curl -s -m 2 "$URL" > /dev/null && break
  sleep 1
done
open "$URL"
wait $SERVER
