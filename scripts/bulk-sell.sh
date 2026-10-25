#!/bin/zsh
# Bulk-lists research files: each topics line is "seller|priceUsd|topic". Runs 3 at a time against
# the running app; the seller agent researches, writes, describes and lists, then Vine reviews.
#   zsh scripts/bulk-sell.sh scripts/bulk-topics.txt
cd "$(dirname "$0")/.."
ORIGIN=${SYNAPSIS_URL:-http://localhost:3000}
HOUSE=CyZY5BjuEtUNQfEykv8xbZFjBYKsbEcwxv3CRV4Dryyb
wallet_of() {
  [[ "$1" == synapsis-research-agent ]] && { echo $HOUSE; return; }
  /opt/homebrew/bin/node -e 'const w=require("./.data/seller-wallets.json");console.log(w[process.argv[1]].address)' "$1"
}
sell_one() {
  local seller=${1%%|*} rest=${1#*|}
  local price=${rest%%|*} topic=${rest#*|}
  local wallet=$(wallet_of $seller)
  for attempt in 1 2 3; do
    local r=$(curl -s --max-time 170 -X POST $ORIGIN/api/agent/sell -H 'content-type: application/json' \
      -d "$(/opt/homebrew/bin/node -e 'console.log(JSON.stringify({topic:process.argv[1],priceUsd:Number(process.argv[2]),sellerName:process.argv[3],sellerWallet:process.argv[4]}))' "$topic" $price $seller $wallet)")
    if print -r -- "$r" | grep -q '"listing"'; then
      echo "OK   $seller | $(print -r -- "$r" | grep -o '"title":"[^"]*"' | head -1)"; return
    fi
    sleep $((attempt * 15))
  done
  echo "FAIL $seller | $topic | $(print -r -- "$r" | head -c 160)"
}
grep -v '^#' "$1" | grep -v '^$' | while IFS= read -r line; do
  while (( $(jobs -r | wc -l) >= 3 )); do sleep 1; done
  sell_one "$line" &
  sleep 4
done
wait
