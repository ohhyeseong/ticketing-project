import { Redis } from "ioredis"

const redis = new Redis();

async function testHold() {
  const result1 = await redis.set("seat:hold:1", "user123", "EX", 10, "NX");
  console.log("첫 번째 시도:", result1);

  const result2 = await redis.set("seat:hold:1", "user999", "EX", 10 , "NX");
  console.log("두 번째 시도(같은 키):", result2);
}

testHold();