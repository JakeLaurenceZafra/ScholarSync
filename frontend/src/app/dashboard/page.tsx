'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import SidebarLayout from '@/components/SidebarLayout';
import Link from 'next/link';
import { jwtDecode } from 'jwt-decode';

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      router.push('/login');
    } else {
      try {
        const decoded: any = jwtDecode(token);
        setUser(decoded);
        if (decoded.role === 'Admin') {
          setIsAdmin(true);
        }
      } catch (err) {
        router.push('/login');
      }
    }
  }, [router]);

  if (!user) {
    return <div className="min-h-screen bg-white"></div>;
  }

  return (
    <SidebarLayout>
      {/* Main Content Area empty canvas */}
      <div className="w-full h-full bg-white p-8">
      </div>

      {/* Floating Admin Button */}
      {isAdmin && (
        <div className="fixed bottom-8 right-8 flex flex-col items-end gap-4 z-50">
          {menuOpen && (
            <div className="bg-white border border-gray-200 shadow-lg rounded-lg p-2 flex flex-col mb-2 animate-in fade-in slide-in-from-bottom-5">
              <Link
                href="/admin/accounts"
                className="px-6 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-indigo-600 rounded transition-colors"
                onClick={() => setMenuOpen(false)}
              >
                Accounts
              </Link>
            </div>
          )}

          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="w-14 h-14 bg-indigo-600 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-indigo-700 hover:scale-105 transition-all outline-none focus:ring-4 focus:ring-indigo-300"
            aria-label="Admin Menu"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      )}
    </SidebarLayout>
  );
}