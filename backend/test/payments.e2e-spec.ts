import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { closeApp, createTestApp, resetState, seedConcert, signupAndLogin } from './helpers';

type Session = { userId: number; token: string };

describe('payments', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let concertId: number;
  let seatIds: number[];
  let alice: Session;
  let bob: Session;
  let reservationId: number;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const pay = (s: Session, id: number, amount: unknown = 50000) =>
    request(app.getHttpServer()).post('/payments').set(auth(s.token)).send({ reservationId: id, amount });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetState(app);
    ({ concertId, seatIds } = await seedConcert(app));
    alice = await signupAndLogin(app, 1);
    bob = await signupAndLogin(app, 2);
    await request(app.getHttpServer()).post(`/seats/${seatIds[0]}/hold`).set(auth(alice.token));
    const res = await request(app.getHttpServer())
      .post('/reservations')
      .set(auth(alice.token))
      .send({ concertId, seatId: seatIds[0] });
    reservationId = res.body.id;
  });

  afterAll(() => closeApp(app));

  it('records a SUCCESS payment for the reservation owner', async () => {
    const res = await pay(alice, reservationId, 50000);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('SUCCESS');
    expect(res.body.amount).toBe(50000);
    expect(res.body.reservationId).toBe(reservationId);
  });

  it('returns the existing payment when the same payment is requested again (idempotent)', async () => {
    const first = await pay(alice, reservationId);
    const second = await pay(alice, reservationId);
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);
    expect(await prisma.payment.count()).toBe(1);
  });

  it("rejects paying for someone else's reservation with 403", async () => {
    expect((await pay(bob, reservationId)).status).toBe(403);
    expect(await prisma.payment.count()).toBe(0);
  });

  it('returns 404 for a reservation that does not exist', async () => {
    expect((await pay(alice, 999999)).status).toBe(404);
  });

  it.each([0, -5, 1.5, 'abc'])('rejects the invalid amount %p with 400', async (amount) => {
    expect((await pay(alice, reservationId, amount)).status).toBe(400);
    expect(await prisma.payment.count()).toBe(0);
  });

  it('rejects paying for a cancelled reservation with 409', async () => {
    await request(app.getHttpServer()).post(`/reservations/${reservationId}/cancel`).set(auth(alice.token));
    expect((await pay(alice, reservationId)).status).toBe(409);
  });
});
