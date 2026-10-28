import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { SeatsService } from '../src/seats/seats.service';
import { closeApp, createTestApp, resetState, seedConcert, signupAndLogin } from './helpers';

type Session = { userId: number; token: string };

describe('concurrency', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let concertId: number;
  let seatIds: number[];

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const hold = (s: Session, seatId: number) =>
    request(app.getHttpServer()).post(`/seats/${seatId}/hold`).set(auth(s.token));
  const signupMany = (count: number) =>
    Promise.all(Array.from({ length: count }, (_, i) => signupAndLogin(app, i + 1)));
  const statuses = (responses: { status: number }[]) =>
    responses.reduce<Record<number, number>>((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {});

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetState(app);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => closeApp(app));

  it('lets exactly one of 20 users hold the same seat at the same time', async () => {
    ({ concertId, seatIds } = await seedConcert(app));
    const users = await signupMany(20);

    const responses = await Promise.all(users.map((u) => hold(u, seatIds[0])));

    expect(statuses(responses)).toEqual({ 201: 1, 409: 19 });
    const winner = users.find((_, i) => responses[i].status === 201);
    expect(await app.get(SeatsService).getHolder(seatIds[0])).toBe(winner.userId);
    const seats = (await request(app.getHttpServer()).get(`/concerts/${concertId}/seats`)).body;
    expect(seats.filter((s) => s.status === 'HOLDING')).toHaveLength(1);
  });

  it('treats 10 simultaneous holds by the same user as success (idempotent)', async () => {
    ({ concertId, seatIds } = await seedConcert(app));
    const [user] = await signupMany(1);

    const responses = await Promise.all(Array.from({ length: 10 }, () => hold(user, seatIds[0])));

    expect(statuses(responses)).toEqual({ 201: 10 });
  });

  it('lets 10 users hold 10 different seats at the same time', async () => {
    ({ concertId, seatIds } = await seedConcert(app, 10));
    const users = await signupMany(10);

    const responses = await Promise.all(users.map((u, i) => hold(u, seatIds[i])));

    expect(statuses(responses)).toEqual({ 201: 10 });
  });

  it('confirms the same reservation once when 10 confirms arrive together', async () => {
    ({ concertId, seatIds } = await seedConcert(app));
    const [user] = await signupMany(1);
    await hold(user, seatIds[0]);
    const created = await request(app.getHttpServer())
      .post('/reservations')
      .set(auth(user.token))
      .send({ concertId, seatId: seatIds[0] });

    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        request(app.getHttpServer()).post(`/reservations/${created.body.id}/confirm`).set(auth(user.token)),
      ),
    );

    expect(statuses(responses)).toEqual({ 201: 10 });
    expect(await prisma.reservation.count({ where: { status: 'CONFIRMED' } })).toBe(1);
    expect((await prisma.seat.findUnique({ where: { id: seatIds[0] } })).status).toBe('SOLD');
  });

  it('creates one reservation when 10 identical create requests arrive together', async () => {
    ({ concertId, seatIds } = await seedConcert(app));
    const [user] = await signupMany(1);
    await hold(user, seatIds[0]);

    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        request(app.getHttpServer())
          .post('/reservations')
          .set(auth(user.token))
          .send({ concertId, seatId: seatIds[0] }),
      ),
    );

    expect(statuses(responses)).toEqual({ 201: 10 });
    expect(new Set(responses.map((r) => r.body.id)).size).toBe(1);
    expect(await prisma.reservation.count()).toBe(1);
  });

  it('does not report an expired hold to a confirm that lost the race to a successful confirm', async () => {
    ({ concertId, seatIds } = await seedConcert(app));
    const [user] = await signupMany(1);
    await hold(user, seatIds[0]);
    const created = await request(app.getHttpServer())
      .post('/reservations')
      .set(auth(user.token))
      .send({ concertId, seatId: seatIds[0] });

    // 두 번째 확정의 선점자 조회를 첫 확정이 끝난 뒤로 미룬다
    const seatsService = app.get(SeatsService);
    const original = seatsService.getHolder.bind(seatsService);
    let calls = 0;
    jest.spyOn(seatsService, 'getHolder').mockImplementation(async (id: number) => {
      if (++calls === 2) await new Promise((resolve) => setTimeout(resolve, 500));
      return original(id);
    });

    const responses = await Promise.all(
      [1, 2].map(() =>
        request(app.getHttpServer()).post(`/reservations/${created.body.id}/confirm`).set(auth(user.token)),
      ),
    );

    expect(statuses(responses)).toEqual({ 201: 2 });
  });

  it('creates one payment when 10 payments for the same reservation arrive together', async () => {
    ({ concertId, seatIds } = await seedConcert(app));
    const [user] = await signupMany(1);
    await hold(user, seatIds[0]);
    const created = await request(app.getHttpServer())
      .post('/reservations')
      .set(auth(user.token))
      .send({ concertId, seatId: seatIds[0] });

    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        request(app.getHttpServer())
          .post('/payments')
          .set(auth(user.token))
          .send({ reservationId: created.body.id, amount: 50000 }),
      ),
    );

    expect(statuses(responses)).toEqual({ 201: 10 });
    expect(new Set(responses.map((r) => r.body.id)).size).toBe(1);
    expect(await prisma.payment.count()).toBe(1);
  });
});
