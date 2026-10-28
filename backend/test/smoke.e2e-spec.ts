import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../src/redis/redis.module';
import { closeApp, createTestApp, resetState } from './helpers';

describe('e2e infrastructure', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
    await resetState(app);
  });

  afterAll(() => closeApp(app));

  it('uses the isolated Redis database from REDIS_DB', () => {
    expect(app.get<Redis>(REDIS_CLIENT).options.db).toBe(15);
  });

  it('serves an empty seat list for an unknown concert', async () => {
    const res = await request(app.getHttpServer()).get('/concerts/1/seats');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
