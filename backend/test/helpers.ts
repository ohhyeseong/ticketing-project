import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import Redis from 'ioredis';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.module';

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

export async function resetState(app: INestApplication): Promise<void> {
  const prisma = app.get(PrismaService);
  const redis = app.get<Redis>(REDIS_CLIENT);
  if (redis.options.db !== 15) {
    throw new Error(`Refusing to flush Redis db ${redis.options.db}: tests must run on db 15`);
  }
  await prisma.payment.deleteMany();
  await prisma.reservation.deleteMany();
  await prisma.seat.deleteMany();
  await prisma.concert.deleteMany();
  await prisma.user.deleteMany();
  await redis.flushdb();
}

export async function seedConcert(
  app: INestApplication,
  seatCount = 5,
): Promise<{ concertId: number; seatIds: number[] }> {
  const prisma = app.get(PrismaService);
  const concert = await prisma.concert.create({
    data: { title: 'test concert', venue: 'test venue', performanceDate: new Date(), status: 'ON_SALE' },
  });
  await prisma.seat.createMany({
    data: Array.from({ length: seatCount }, (_, i) => ({ concertId: concert.id, seatNumber: `A${i + 1}` })),
  });
  const seats = await prisma.seat.findMany({ where: { concertId: concert.id }, orderBy: { id: 'asc' } });
  return { concertId: concert.id, seatIds: seats.map((s) => s.id) };
}

export async function signupAndLogin(
  app: INestApplication,
  n: number,
): Promise<{ userId: number; token: string }> {
  const email = `user${n}@test.com`;
  const signup = await request(app.getHttpServer()).post('/auth/signup').send({ email, password: '1234' });
  const login = await request(app.getHttpServer()).post('/auth/login').send({ email, password: '1234' });
  return { userId: signup.body.id, token: login.body.accessToken };
}

export async function closeApp(app: INestApplication): Promise<void> {
  await app.get<Redis>(REDIS_CLIENT).quit();
  await app.get(PrismaService).$disconnect();
  await app.close();
}
