#!/bin/bash
# 같은 좌석을 N명이 동시에 선점 시도하는 테스트 스크립트
# 사용법: USER_COUNT, CONCERT_ID, SEAT_ID만 원하는 값으로 바꾸고 실행
# user1@test.com ~ userN@test.com 계정이 없으면 자동으로 회원가입까지 해줌 (이미 있으면 그냥 무시)
# 테스트가 끝나면 실제로 선점에 성공한 유저를 찾아서 자동으로 선점 취소까지 해줌 (좌석을 AVAILABLE로 원복)

USER_COUNT=10
CONCERT_ID=3
SEAT_ID=201

declare -a TOKENS

for i in $(seq 1 $USER_COUNT); do
  curl -s -X POST http://localhost:3000/auth/signup \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"user$i@test.com\",\"password\":\"1234\"}" > /dev/null

  TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"user$i@test.com\",\"password\":\"1234\"}" \
    | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).accessToken))")
  TOKENS[$i]=$TOKEN

  (curl -s -o "/tmp/result_$i.json" -w "%{http_code}" -X POST \
    "http://localhost:3000/seats/$SEAT_ID/hold" \
    -H "Authorization: Bearer $TOKEN" > "/tmp/status_$i.txt") &
done

wait

WINNER=""
for i in $(seq 1 $USER_COUNT); do
  echo "--- user$i 결과 (status: $(cat /tmp/status_$i.txt)) ---"
  cat "/tmp/result_$i.json"
  echo
  if grep -qE "^(200|201)$" "/tmp/status_$i.txt"; then
    WINNER=$i
  fi
done

echo "--- 최종 좌석 상태 ---"
curl -s "http://localhost:3000/concerts/$CONCERT_ID/seats" | node -e "
let raw='';process.stdin.on('data',d=>raw+=d);
process.stdin.on('end',()=>{
  const seats = JSON.parse(raw);
  console.log(seats.find(s => s.id === $SEAT_ID));
});
"

if [ -n "$WINNER" ]; then
  echo
  echo "--- 선점 성공한 user$WINNER 토큰으로 선점 취소 진행 ---"
  curl -s -X DELETE "http://localhost:3000/seats/$SEAT_ID/hold" \
    -H "Authorization: Bearer ${TOKENS[$WINNER]}"
  echo
  echo "--- 취소 후 좌석 상태 ---"
  curl -s "http://localhost:3000/concerts/$CONCERT_ID/seats" | node -e "
let raw='';process.stdin.on('data',d=>raw+=d);
process.stdin.on('end',()=>{
  const seats = JSON.parse(raw);
  console.log(seats.find(s => s.id === $SEAT_ID));
});
"
else
  echo
  echo "--- 선점에 성공한 유저가 없어서 취소할 게 없음 ---"
fi
