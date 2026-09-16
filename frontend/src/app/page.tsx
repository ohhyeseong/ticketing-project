'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

type Concert = {
  id: number;
  title: string;
  venue: string;
  performanceDate: string;
  status: string;
};

export default function HomePage() {
  const [concerts, setConcerts] = useState<Concert[]>([]);

  useEffect(() => {
    api('/concerts').then(setConcerts);
  }, []);

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-xl font-bold mb-4">공연 목록</h1>
      <ul className="flex flex-col gap-2">
        {concerts.map((c) => (
          <li key={c.id} className="border rounded p-3">
            <Link href={`/concerts/${c.id}`} className="font-semibold">
              {c.title}
            </Link>
            <div className="text-sm text-gray-500">
              {c.venue} · {new Date(c.performanceDate).toLocaleString()} · {c.status}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
