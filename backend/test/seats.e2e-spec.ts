import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { closeApp, createTestApp, resetState, seedConcert, signupAndLogin } from './helpers';

describe('seat hold', () => {
  let app: INestApplication;
  let concertId: number;
  let seatIds: number[];
  let alice: { userId: number; token: string };
  let bob: { userId: number; token: string };

  const hold = (token: string, seatId: number | string) =>
    request(app.getHttpServer()).post(`/seats/${seatId}/hold`).set('Authorization', `Bearer ${token}`);
  const release = (token: string, seatId: number | string) =>
    request(app.getHttpServer()).delete(`/seats/${seatId}/hold`).set('Authorization', `Bearer ${token}`);
  const list = async () => (await request(app.getHttpServer()).get(`/concerts/${concertId}/seats`)).body;
  const view = async (seatId: number) => (await list()).find((s) => s.id === seatId);
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetState(app);
    ({ concertId, seatIds } = await seedConcert(app));
    alice = await signupAndLogin(app, 1);
    bob = await signupAndLogin(app, 2);
  });

  afterEach(() => {
    delete process.env.SEAT_HOLD_TTL_SECONDS;
  });

  afterAll(() => closeApp(app));

  it('first hold succeeds and the seat list shows HOLDING with the holder id', async () => {
    const res = await hold(alice.token, seatIds[0]);
    expect(res.status).toBe(201);
    const seat = await view(seatIds[0]);
    expect(seat.status).toBe('HOLDING');
    expect(seat.heldBy).toBe(alice.userId);
  });

  it('rejects a second user holding the same seat with 409', async () => {
    await hold(alice.token, seatIds[0]);
    const res = await hold(bob.token, seatIds[0]);
    expect(res.status).toBe(409);
    expect((await view(seatIds[0])).heldBy).toBe(alice.userId);
  });

  it('treats a repeated hold by the same user as success (idempotent)', async () => {
    await hold(alice.token, seatIds[0]);
    const res = await hold(alice.token, seatIds[0]);
    expect(res.status).toBe(201);
    const seat = await view(seatIds[0]);
    expect(seat.status).toBe('HOLDING');
    expect(seat.heldBy).toBe(alice.userId);
  });

  it('rejects holding a seat whose DB status is SOLD with 409', async () => {
    await app.get(PrismaService).seat.update({ where: { id: seatIds[0] }, data: { status: 'SOLD' } });
    const res = await hold(alice.token, seatIds[0]);
    expect(res.status).toBe(409);
  });

  it('returns 404 for a seat that does not exist', async () => {
    const res = await hold(alice.token, 999999);
    expect(res.status).toBe(404);
  });

  it('returns 400 for a non-numeric seat id', async () => {
    const res = await hold(alice.token, 'abc');
    expect(res.status).toBe(400);
  });

  it('shows the seat as AVAILABLE again after the hold TTL expires', async () => {
    process.env.SEAT_HOLD_TTL_SECONDS = '1';
    await hold(alice.token, seatIds[0]);
    await sleep(1500);
    const seat = await view(seatIds[0]);
    expect(seat.status).toBe('AVAILABLE');
    expect(seat.heldBy).toBeNull();
  });

  it('lets another user hold the seat after the TTL expires', async () => {
    process.env.SEAT_HOLD_TTL_SECONDS = '1';
    await hold(alice.token, seatIds[0]);
    await sleep(1500);
    const res = await hold(bob.token, seatIds[0]);
    expect(res.status).toBe(201);
    expect((await view(seatIds[0])).heldBy).toBe(bob.userId);
  });

  it('cancelHold by the holder frees the seat', async () => {
    await hold(alice.token, seatIds[0]);
    const res = await release(alice.token, seatIds[0]);
    expect(res.status).toBe(200);
    expect((await view(seatIds[0])).status).toBe('AVAILABLE');
  });

  it('cancelHold by another user returns 409 and keeps the hold', async () => {
    await hold(alice.token, seatIds[0]);
    const res = await release(bob.token, seatIds[0]);
    expect(res.status).toBe(409);
    expect((await view(seatIds[0])).heldBy).toBe(alice.userId);
  });

  it('cancelHold on a seat nobody holds returns 409', async () => {
    const res = await release(alice.token, seatIds[0]);
    expect(res.status).toBe(409);
  });
});
