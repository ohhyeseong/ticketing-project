'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import Button from '@/components/Button';

type Seat = {
  id: number;
  seatNumber: string;
  status: 'AVAILABLE' | 'HOLDING' | 'SOLD';
  heldBy: number | null;
};

type Step = 'idle' | 'held' | 'reserved' | 'paid' | 'confirmed';

export default function ConcertDetailPage() {
  const params = useParams();
  const concertId = Number(params.id);

  const [seats, setSeats] = useState<Seat[]>([]);
  const [selectedSeat, setSelectedSeat] = useState<Seat | null>(null);
  const [reservationId, setReservationId] = useState<number | null>(null);
  const [step, setStep] = useState<Step>('idle');
  const [error, setError] = useState('');

  async function loadSeats() {
    const data = await api(`/concerts/${concertId}/seats`);
    setSeats(data);
  }

  useEffect(() => {
    loadSeats();
  }, [concertId]);

  function resetFlow() {
    setSelectedSeat(null);
    setReservationId(null);
    setStep('idle');
  }

  async function handleSelectSeat(seat: Seat) {
    if (seat.status !== 'AVAILABLE') return;
    setError('');
    try {
      await api(`/seats/${seat.id}/hold`, { method: 'POST' });
      setSelectedSeat(seat);
      setStep('held');
      loadSeats();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleCancelHold() {
    if (!selectedSeat) return;
    setError('');
    try {
      await api(`/seats/${selectedSeat.id}/hold`, { method: 'DELETE' });
      resetFlow();
      loadSeats();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleCreateReservation() {
    if (!selectedSeat) return;
    setError('');
    try {
      const data = await api('/reservations', {
        method: 'POST',
        body: JSON.stringify({ concertId, seatId: selectedSeat.id }),
      });
      setReservationId(data.id);
      setStep('reserved');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handlePay() {
    if (!reservationId) return;
    setError('');
    try {
      await api('/payments', {
        method: 'POST',
        body: JSON.stringify({ reservationId, amount: 50000 }),
      });
      setStep('paid');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleConfirm() {
    if (!reservationId) return;
    setError('');
    try {
      await api(`/reservations/${reservationId}/confirm`, { method: 'POST' });
      setStep('confirmed');
      loadSeats();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function seatColor(seat: Seat) {
    if (seat.status === 'SOLD') return 'bg-gray-400 text-gray-700 cursor-not-allowed';
    if (seat.status === 'HOLDING') return 'bg-yellow-300 text-yellow-900 cursor-not-allowed';
    if (selectedSeat?.id === seat.id) return 'bg-blue-500 text-white font-bold';
    return 'bg-green-200 text-green-900 hover:bg-green-300';
  }

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-6">
      <h1 className="text-xl font-bold">좌석 선택</h1>

      <div className="flex gap-4 text-sm">
        <span className="flex items-center gap-1">
          <span className="w-4 h-4 rounded bg-green-200 border" /> 선택 가능
        </span>
        <span className="flex items-center gap-1">
          <span className="w-4 h-4 rounded bg-blue-500 border" /> 선택함
        </span>
        <span className="flex items-center gap-1">
          <span className="w-4 h-4 rounded bg-yellow-300 border" /> 선점중
        </span>
        <span className="flex items-center gap-1">
          <span className="w-4 h-4 rounded bg-gray-400 border" /> 판매완료
        </span>
      </div>

      <div className="grid grid-cols-10 gap-2">
        {seats.map((seat) => (
          <button
            key={seat.id}
            onClick={() => handleSelectSeat(seat)}
            disabled={seat.status !== 'AVAILABLE'}
            className={`text-xs font-semibold rounded-lg p-2 shadow-sm transition-colors disabled:cursor-not-allowed ${seatColor(seat)}`}
          >
            {seat.seatNumber}
          </button>
        ))}
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      {selectedSeat && (
        <div className="border rounded p-4 flex flex-col gap-3">
          <p>
            선택한 좌석: <b>{selectedSeat.seatNumber}</b>
          </p>

          {step === 'held' && (
            <div className="flex gap-2">
              <Button onClick={handleCreateReservation}>예매 생성</Button>
              <Button variant="secondary" onClick={handleCancelHold}>
                선점 취소
              </Button>
            </div>
          )}

          {step === 'reserved' && (
            <Button onClick={handlePay}>결제하기 (50,000원)</Button>
          )}

          {step === 'paid' && <Button onClick={handleConfirm}>예매 확정</Button>}

          {step === 'confirmed' && (
            <p className="text-green-600 font-semibold">예매가 확정되었습니다!</p>
          )}
        </div>
      )}
    </div>
  );
}
