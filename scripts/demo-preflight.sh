#!/bin/zsh
# Checks everything the live demo depends on. Run from the repo: zsh scripts/demo-preflight.sh
cd "$(dirname "$0")/.."
export PATH=/opt/homebrew/bin:$PATH
ok() { print "✓ $1"; }
bad() { print "✗ $1"; FAILED=1; }
FAILED=0

curl -s -o /dev/null -m 5 localhost:3000/ && ok "App is running on localhost:3000" || bad "App is not running: npm run start"
T=$(grep '^AGENT_STUDIO_VERIFIER_TOKEN=' .env.local | cut -d= -f2)
[[ $(curl -s -o /dev/null -w '%{http_code}' -m 5 -H "Authorization: Bearer $T" localhost:3000/agent-studio/v1/health) == 200 ]] && ok "Race health endpoint" || bad "Race health endpoint"
pgrep -f "cloudflared tunnel" >/dev/null && ok "Cloudflare tunnel process is up (public URL in the team page)" || bad "Tunnel is not running: cloudflared tunnel --url http://localhost:3000"

COUNT=$(curl -s -m 10 localhost:3000/api/listings | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).listings.length)}catch{console.log(0)}})')
(( COUNT > 0 )) && ok "$COUNT knowledge packs listed" || bad "No listings returned"

K=$(grep '^GEMINI_API_KEY=' .env.local | cut -d= -f2)
M=$(grep '^GEMINI_MODEL=' .env.local | cut -d= -f2)
curl -s -m 25 "https://generativelanguage.googleapis.com/v1beta/models/${M:-gemini-3.5-flash-lite}:generateContent" -H "x-goog-api-key: $K" -H 'content-type: application/json' \
  -d '{"contents":[{"role":"user","parts":[{"text":"Say ok"}]}]}' | grep -q '"text"' && ok "Gemini ($M) answers" || bad "Gemini ($M) not answering (quota?)"

npm run -s wallets 2>&1 | grep -q "Ready" && ok "Agent and seller wallets hold devnet USDC" || bad "Wallets not ready: npm run wallets"

npx tsx scripts/check-mcp.ts >/dev/null 2>&1 && ok "MCP server: search_knowledge works (Buy Box returned)" || bad "MCP server search failed"

(( FAILED )) && print "\nSome checks failed: see DEMO.md → If something goes wrong." || print "\nAll good. Break a leg."
