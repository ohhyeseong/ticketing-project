import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { SeatsService } from '../src/seats/seats.service';
import { closeApp, createTestApp, resetState, seedConcert, signupAndLogin } from './helpers';

type Session = { userId: number; token: string };

describe('reservations', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let concertId: number;
  let seatIds: number[];
  let alice: Session;
  let bob: Session;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const hold = (s: Session, seatId: number) =>
    request(app.getHttpServer()).post(`/seats/${seatId}/hold`).set(auth(s.token));
  const create = (s: Session, seatId: number, cid = concertId) =>
    request(app.getHttpServer()).post('/reservations').set(auth(s.token)).send({ concertId: cid, seatId });
  const confirm = (s: Session, id: number | string) =>
    request(app.getHttpServer()).post(`/reservations/${id}/confirm`).set(auth(s.token));
  const cancel = (s: Session, id: number | string) =>
    request(app.getHttpServer()).post(`/reservations/${id}/cancel`).set(auth(s.token));
  const seatRow = (seatId: number) => prisma.seat.findUnique({ where: { id: seatId } });
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  // alice가 첫 좌석을 선점하고 예약까지 만든 상태
  const heldReservation = async () => {
    await hold(alice, seatIds[0]);
    const res = await create(alice, seatIds[0]);
    return res.body.id as number;
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetState(app);
    ({ concertId, seatIds } = await seedConcert(app));
    alice = await signupAndLogin(app, 1);
    bob = await signupAndLogin(app, 2);
  });

  afterEach(() => {
    delete process.env.SEAT_HOLD_TTL_SECONDS;
    jest.restoreAllMocks();
  });

  afterAll(() => closeApp(app));

  describe('create', () => {
    it('lets the holder create a PENDING reservation', async () => {
      await hold(alice, seatIds[0]);
      const res = await create(alice, seatIds[0]);
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('PENDING');
      expect(res.body.userId).toBe(alice.userId);
    });

    it('rejects a seat nobody holds with 403', async () => {
      expect((await create(alice, seatIds[0])).status).toBe(403);
    });

    it('rejects a seat held by someone else with 403', async () => {
      await hold(bob, seatIds[0]);
      expect((await create(alice, seatIds[0])).status).toBe(403);
    });

    it('returns the existing PENDING reservation when the same user asks twice', async () => {
      await hold(alice, seatIds[0]);
      const first = await create(alice, seatIds[0]);
      const second = await create(alice, seatIds[0]);
      expect(second.status).toBe(201);
      expect(second.body.id).toBe(first.body.id);
      expect(await prisma.reservation.count()).toBe(1);
    });

    it('rejects a concertId that does not match the seat with 400', async () => {
      const other = await seedConcert(app, 1);
      await hold(alice, seatIds[0]);
      expect((await create(alice, seatIds[0], other.concertId)).status).toBe(400);
    });

    it('returns 404 for a seat that does not exist', async () => {
      expect((await create(alice, 999999)).status).toBe(404);
    });
  });

  describe('confirm', () => {
    it('confirms for the owner, marks the seat SOLD and deletes the hold key', async () => {
      const id = await heldReservation();
      const res = await confirm(alice, id);
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('CONFIRMED');
      expect((await seatRow(seatIds[0])).status).toBe('SOLD');
      expect(await app.get(SeatsService).getHolder(seatIds[0])).toBeNull();
    });

    it('is idempotent: confirming twice succeeds with the same result', async () => {
      const id = await heldReservation();
      await confirm(alice, id);
      const again = await confirm(alice, id);
      expect(again.status).toBe(201);
      expect(again.body.status).toBe('CONFIRMED');
      expect((await seatRow(seatIds[0])).status).toBe('SOLD');
    });

    it('rejects another user with 403', async () => {
      const id = await heldReservation();
      expect((await confirm(bob, id)).status).toBe(403);
    });

    it('returns 404 for an unknown id and 400 for a non-numeric id', async () => {
      expect((await confirm(alice, 999999)).status).toBe(404);
      expect((await confirm(alice, 'abc')).status).toBe(400);
    });

    it('rejects confirmation after the hold TTL expired with 409', async () => {
      process.env.SEAT_HOLD_TTL_SECONDS = '1';
      const id = await heldReservation();
      await sleep(1500);
      expect((await confirm(alice, id)).status).toBe(409);
    });

    it('keeps a SOLD seat unholdable by others, even past the original TTL', async () => {
      process.env.SEAT_HOLD_TTL_SECONDS = '1';
      const id = await heldReservation();
      await confirm(alice, id);
      await sleep(1500);
      expect((await hold(bob, seatIds[0])).status).toBe(409);
      expect((await seatRow(seatIds[0])).status).toBe('SOLD');
    });

    it('rolls back the reservation when the seat update fails inside the transaction', async () => {
      const id = await heldReservation();
      const original = prisma.$transaction.bind(prisma) as any;
      jest.spyOn(prisma, '$transaction').mockImplementationOnce(((fn: any) =>
        original((tx: any) =>
          fn({
            reservation: tx.reservation,
            seat: {
              update: () => {
                throw new Error('injected seat update failure');
              },
            },
          }),
        )) as any);

      const res = await confirm(alice, id);
      expect(res.status).toBe(500);
      expect((await prisma.reservation.findUnique({ where: { id } })).status).toBe('PENDING');
      expect((await seatRow(seatIds[0])).status).toBe('AVAILABLE');
    });
  });

  describe('cancel', () => {
    it('cancels for the owner and frees the seat and the hold key', async () => {
      const id = await heldReservation();
      const res = await cancel(alice, id);
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('CANCELLED');
      expect(await app.get(SeatsService).getHolder(seatIds[0])).toBeNull();
      expect((await seatRow(seatIds[0])).status).toBe('AVAILABLE');
    });

    it('returns a confirmed seat to AVAILABLE when the reservation is cancelled', async () => {
      const id = await heldReservation();
      await confirm(alice, id);
      await cancel(alice, id);
      expect((await seatRow(seatIds[0])).status).toBe('AVAILABLE');
    });

    it('is idempotent: cancelling twice gives the same result', async () => {
      const id = await heldReservation();
      await cancel(alice, id);
      const again = await cancel(alice, id);
      expect(again.status).toBe(201);
      expect(again.body.status).toBe('CANCELLED');
    });

    it('rejects another user with 403', async () => {
      const id = await heldReservation();
      expect((await cancel(bob, id)).status).toBe(403);
    });

    it('lets another user hold afterwards while the previous owner can no longer confirm', async () => {
      const id = await heldReservation();
      await cancel(alice, id);
      expect((await hold(bob, seatIds[0])).status).toBe(201);
      expect((await confirm(alice, id)).status).toBe(409);
    });
  });
});
