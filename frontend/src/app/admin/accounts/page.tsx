'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import SidebarLayout from '@/components/SidebarLayout';
import { API_URL } from '@/lib/api';
import {
    Users,
    Trash2,
    Shield,
    Loader2
} from 'lucide-react';

type Account = {
    account_id: string;
    accountName: string;
    accountEmail: string;
    accountRole: string;
};

export default function AdminAccountsPage() {
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const router = useRouter();

    const showToast = (message: string, type: 'success' | 'error' = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    useEffect(() => {
        fetchAccounts();
    }, []);

    const fetchAccounts = async () => {
        try {
            const token = localStorage.getItem('auth_token');
            if (!token) { router.push('/login'); return; }
            const res = await fetch(`${API_URL}/api/accounts`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.status === 403) { router.push('/dashboard'); return; }
            if (res.ok) setAccounts(await res.json());
            else setError('Failed to load accounts');
        } catch (err) {
            setError('Failed to load accounts');
        } finally {
            setLoading(false);
        }
    };

    const handleRoleChange = async (accountId: string, newRole: string) => {
        try {
            const token = localStorage.getItem('auth_token');
            const res = await fetch(`${API_URL}/api/accounts/${accountId}/role`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ role: newRole })
            });
            if (res.ok) {
                setAccounts(prev => prev.map(acc => acc.account_id === accountId ? { ...acc, accountRole: newRole } : acc));
                showToast('Role updated!');
            } else {
                showToast('Failed to update role', 'error');
            }
        } catch { showToast('Failed to update role', 'error'); }
    };

    const handleDelete = async (accountId: string) => {
        if (!window.confirm('Permanently delete this account?')) return;
        try {
            const token = localStorage.getItem('auth_token');
            const res = await fetch(`${API_URL}/api/accounts/${accountId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                setAccounts(prev => prev.filter(acc => acc.account_id !== accountId));
                showToast('Account deleted');
            } else {
                showToast('Failed to delete account', 'error');
            }
        } catch { showToast('Failed to delete account', 'error'); }
    };

    if (loading) {
        return (
            <SidebarLayout>
                <div className="flex items-center justify-center h-[60vh]">
                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent" />
                </div>
            </SidebarLayout>
        );
    }

    return (
        <SidebarLayout>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="mb-8">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl shadow-md">
                            <Shield className="w-6 h-6 text-white" />
                        </div>
                        <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">Account Management</h1>
                    </div>
                    <p className="text-gray-500 ml-14">Manage user roles and platform access</p>
                </div>

                {error && <div className="mb-4 text-red-600 font-medium text-sm bg-red-50 p-3 rounded-xl">{error}</div>}

                <div className="glass-card overflow-hidden">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-gray-200 bg-gray-50/50">
                                <th className="p-4 font-semibold text-gray-700 text-sm">User</th>
                                <th className="p-4 font-semibold text-gray-700 text-sm">Email</th>
                                <th className="p-4 font-semibold text-gray-700 text-sm">Role</th>
                                <th className="p-4 font-semibold text-gray-700 text-sm text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {accounts.map((acc, idx) => (
                                <tr key={acc.account_id} className={`border-b border-gray-100 hover:bg-blue-50/30 transition-colors ${idx % 2 === 0 ? '' : 'bg-gray-50/30'}`}>
                                    <td className="p-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full flex items-center justify-center text-white font-bold text-xs">
                                                {acc.accountName?.charAt(0).toUpperCase()}
                                            </div>
                                            <span className="font-medium text-gray-800 text-sm">{acc.accountName}</span>
                                        </div>
                                    </td>
                                    <td className="p-4 text-gray-500 text-sm">{acc.accountEmail}</td>
                                    <td className="p-4">
                                        <select
                                            value={acc.accountRole || 'Student'}
                                            onChange={e => handleRoleChange(acc.account_id, e.target.value)}
                                            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        >
                                            <option value="Student">Student</option>
                                            <option value="Advisers">Advisers</option>
                                            <option value="Admin">Admin</option>
                                        </select>
                                    </td>
                                    <td className="p-4 text-right">
                                        <button onClick={() => handleDelete(acc.account_id)}
                                            className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                            title="Delete account"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {accounts.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="p-12 text-center text-gray-400">
                                        <Users className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                                        <p>No accounts found</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Toast */}
            {toast && (
                <div className={`fixed bottom-6 right-6 z-[200] px-5 py-3 rounded-xl shadow-lg text-sm font-medium text-white animate-slide-up ${toast.type === 'success' ? 'bg-gradient-to-r from-green-500 to-emerald-500' : 'bg-gradient-to-r from-red-500 to-rose-500'
                    }`}>
                    {toast.message}
                </div>
            )}
        </SidebarLayout>
    );
}
