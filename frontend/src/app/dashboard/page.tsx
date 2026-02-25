'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      router.push('/login');
    } else {
      setUser({ message: "You are logged in!" });
    }
  }, [router]);

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold text-indigo-600">ScholarSync Dashboard</h1>
      <p className="mt-4 text-gray-600">Welcome! Your Google Authentication is working.</p>
      <button 
        onClick={() => { localStorage.removeItem('auth_token'); router.push('/login'); }}
        className="mt-6 px-4 py-2 bg-red-500 text-white rounded-lg"
      >
        Logout
      </button>
    </div>
  );
}