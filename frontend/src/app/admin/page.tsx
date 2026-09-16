'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import Button from '@/components/Button';

type Concert = {
  id: number;
  title: string;
  venue: string;
  performanceDate: string;
  status: 'BEFORE_SALE' | 'ON_SALE' | 'CLOSED';
};

type Seat = {
  id: number;
  status: 'AVAILABLE' | 'HOLDING' | 'SOLD';
};

type Reservation = {
  id: number;
  status: string;
  createdAt: string;
  user: { id: number; email: string };
  concert: { id: number; title: string };
  seat: { id: number; seatNumber: string };
};

const STATUS_OPTIONS = ['BEFORE_SALE', 'ON_SALE', 'CLOSED'] as const;

export default function AdminPage() {
  const [concerts, setConcerts] = useState<Concert[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [seatCounts, setSeatCounts] = useState<Record<number, { available: number; holding: number; sold: number }>>({});

  const [title, setTitle] = useState('');
  const [venue, setVenue] = useState('');
  const [performanceDate, setPerformanceDate] = useState('');
  const [error, setError] = useState('');

  async function loadConcerts() {
    setConcerts(await api('/concerts'));
  }

  async function loadReservations() {
    setReservations(await api('/reservations'));
  }

  useEffect(() => {
    loadConcerts();
    loadReservations();
  }, []);

  async function handleCreateConcert(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api('/concerts', {
        method: 'POST',
        body: JSON.stringify({ title, venue, performanceDate }),
      });
      setTitle('');
      setVenue('');
      setPerformanceDate('');
      loadConcerts();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleStatusChange(concertId: number, status: string) {
    setError('');
    try {
      await api(`/concerts/${concertId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      loadConcerts();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function loadSeatCounts(concertId: number) {
    const seats: Seat[] = await api(`/concerts/${concertId}/seats`);
    setSeatCounts((prev) => ({
      ...prev,
      [concertId]: {
        available: seats.filter((s) => s.status === 'AVAILABLE').length,
        holding: seats.filter((s) => s.status === 'HOLDING').length,
        sold: seats.filter((s) => s.status === 'SOLD').length,
      },
    }));
  }

  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-10">
      <h1 className="text-2xl font-bold">관리자 페이지</h1>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <section>
        <h2 className="text-lg font-bold mb-2">공연 등록</h2>
        <form onSubmit={handleCreateConcert} className="flex flex-col gap-3 max-w-sm">
          <input
            placeholder="공연명"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="border p-2 rounded"
            required
          />
          <input
            placeholder="공연장"
            value={venue}
            onChange={(e) => setVenue(e.target.value)}
            className="border p-2 rounded"
            required
          />
          <input
            placeholder="공연일시 (예: 2026-11-01T19:00:00)"
            value={performanceDate}
            onChange={(e) => setPerformanceDate(e.target.value)}
            className="border p-2 rounded"
            required
          />
          <Button type="submit">등록</Button>
        </form>
      </section>

      <section>
        <h2 className="text-lg font-bold mb-2">공연 관리</h2>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left border-b">
              <th className="p-2">제목</th>
              <th className="p-2">공연장</th>
              <th className="p-2">상태</th>
              <th className="p-2">좌석 현황</th>
            </tr>
          </thead>
          <tbody>
            {concerts.map((c) => (
              <tr key={c.id} className="border-b">
                <td className="p-2">{c.title}</td>
                <td className="p-2">{c.venue}</td>
                <td className="p-2">
                  <select
                    value={c.status}
                    onChange={(e) => handleStatusChange(c.id, e.target.value)}
                    className="border rounded p-1"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="p-2">
                  {seatCounts[c.id] ? (
                    <span>
                      가능 {seatCounts[c.id].available} · 선점 {seatCounts[c.id].holding} · 판매완료{' '}
                      {seatCounts[c.id].sold}
                    </span>
                  ) : (
                    <Button variant="secondary" onClick={() => loadSeatCounts(c.id)}>
                      조회
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="text-lg font-bold mb-2">전체 예매 내역</h2>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left border-b">
              <th className="p-2">예매번호</th>
              <th className="p-2">유저</th>
              <th className="p-2">공연</th>
              <th className="p-2">좌석</th>
              <th className="p-2">상태</th>
              <th className="p-2">예매일시</th>
            </tr>
          </thead>
          <tbody>
            {reservations.map((r) => (
              <tr key={r.id} className="border-b">
                <td className="p-2">{r.id}</td>
                <td className="p-2">{r.user.email}</td>
                <td className="p-2">{r.concert.title}</td>
                <td className="p-2">{r.seat.seatNumber}</td>
                <td className="p-2">{r.status}</td>
                <td className="p-2">{new Date(r.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
