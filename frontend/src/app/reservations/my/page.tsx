'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import Button from '@/components/Button';

type Reservation = {
  id: number;
  concertId: number;
  seatId: number;
  status: string;
  createdAt: string;
};

export default function MyReservationsPage() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [error, setError] = useState('');

  async function load() {
    const data = await api('/reservations/my');
    setReservations(data);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCancel(id: number) {
    setError('');
    try {
      await api(`/reservations/${id}/cancel`, { method: 'POST' });
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-xl font-bold mb-4">내 예매 내역</h1>
      {error && <p className="text-red-500 text-sm mb-2">{error}</p>}
      <ul className="flex flex-col gap-2">
        {reservations.map((r) => (
          <li key={r.id} className="border rounded p-3 flex justify-between items-center">
            <div>
              <div>예매 #{r.id} · 좌석 {r.seatId}</div>
              <div className="text-sm text-gray-500">
                상태: {r.status} · {new Date(r.createdAt).toLocaleString()}
              </div>
            </div>
            {r.status !== 'CANCELLED' && (
              <Button variant="danger" onClick={() => handleCancel(r.id)}>
                취소
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
