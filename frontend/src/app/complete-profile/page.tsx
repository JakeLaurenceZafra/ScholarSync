'use client';

import { Suspense, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { API_URL } from '@/lib/api';
import { GraduationCap, Loader2 } from 'lucide-react';

function CompleteProfileForm() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const token = searchParams.get('token');

    const [name, setName] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) { setError('Please enter your full name'); return; }
        setLoading(true);
        setError('');

        try {
            const res = await fetch(`${API_URL}/api/complete-profile`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, name: name.trim() })
            });
            const data = await res.json();
            if (res.ok && data.token) {
                router.push(`/auth-success?token=${data.token}`);
            } else {
                setError(data.error || 'Failed to complete profile');
                setLoading(false);
            }
        } catch {
            setError('Failed to complete profile. Try again.');
            setLoading(false);
        }
    };

    if (!token) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 flex items-center justify-center">
                <div className="text-center bg-white p-8 rounded-2xl shadow-lg">
                    <p className="text-red-500 font-medium">Invalid or missing registration token.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 flex items-center justify-center px-4">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-10">
                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                        <GraduationCap className="w-8 h-8 text-white" />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-800">Complete Your Profile</h2>
                    <p className="text-gray-500 mt-2 text-sm">Enter your full name to get started</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                    {error && <div className="text-red-500 text-sm text-center bg-red-50 p-3 rounded-xl">{error}</div>}
                    <div>
                        <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                        <input
                            id="name" type="text" autoComplete="name" required
                            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="John Doe"
                            value={name}
                            onChange={e => setName(e.target.value)}
                        />
                    </div>
                    <button type="submit" disabled={loading}
                        className="w-full py-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-xl font-medium hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                        {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : 'Complete Sign Up'}
                    </button>
                </form>
            </div>
        </div>
    );
}

export default function CompleteProfilePage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 flex items-center justify-center">
                <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-500 border-t-transparent" />
            </div>
        }>
            <CompleteProfileForm />
        </Suspense>
    );
}
