'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { clearTokens, getRole, getToken } from '@/lib/api';
import Button from './Button';

export default function Navbar() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    setLoggedIn(!!getToken());
    setIsAdmin(getRole() === 'ADMIN');
  }, []);

  function logout() {
    clearTokens();
    window.location.href = '/login';
  }

  const linkClass = 'font-medium text-gray-700 hover:text-indigo-600 transition-colors';

  return (
    <nav className="flex items-center justify-between px-6 py-4 border-b bg-white">
      <div className="flex items-center gap-5">
        <Link href="/" className="font-bold text-lg text-gray-900">
          티켓팅
        </Link>
        <Link href="/" className={linkClass}>
          공연 목록
        </Link>
        {loggedIn && (
          <Link href="/reservations/my" className={linkClass}>
            내 예매
          </Link>
        )}
        {isAdmin && (
          <Link href="/admin" className={linkClass}>
            관리자
          </Link>
        )}
      </div>
      <div className="flex items-center gap-4">
        {loggedIn ? (
          <Button variant="secondary" onClick={logout} className="px-3 py-1.5 text-xs">
            로그아웃
          </Button>
        ) : (
          <>
            <Link href="/login" className={linkClass}>
              로그인
            </Link>
            <Link href="/signup" className={linkClass}>
              회원가입
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}
