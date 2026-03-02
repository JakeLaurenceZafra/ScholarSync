'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import SidebarLayout from '@/components/SidebarLayout';
import axios from 'axios';

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
    const router = useRouter();

    useEffect(() => {
        fetchAccounts();
    }, []);

    const fetchAccounts = async () => {
        try {
            const token = localStorage.getItem('auth_token');
            if (!token) {
                router.push('/login');
                return;
            }

            const res = await axios.get('http://localhost:5000/api/accounts', {
                headers: { Authorization: `Bearer ${token}` }
            });
            setAccounts(res.data);
        } catch (err: any) {
            if (err.response?.status === 403) {
                router.push('/dashboard'); // Admins only
            } else {
                setError(err.response?.data?.error || "Failed to load accounts.");
            }
        } finally {
            setLoading(false);
        }
    };

    const handleRoleChange = async (accountId: string, newRole: string) => {
        try {
            const token = localStorage.getItem('auth_token');
            await axios.put(`http://localhost:5000/api/accounts/${accountId}/role`,
                { role: newRole },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            // Update local state to reflect the change visually
            setAccounts(prev => prev.map(acc =>
                acc.account_id === accountId ? { ...acc, accountRole: newRole } : acc
            ));
        } catch (err) {
            alert("Failed to update role. Ensure you have Admin privileges.");
        }
    };

    const handleDelete = async (accountId: string) => {
        if (!window.confirm("Are you sure you want to permanently delete this account?")) return;

        try {
            const token = localStorage.getItem('auth_token');
            await axios.delete(`http://localhost:5000/api/accounts/${accountId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            // Remove from UI
            setAccounts(prev => prev.filter(acc => acc.account_id !== accountId));
        } catch (err) {
            alert("Failed to delete account.");
        }
    };

    if (loading) return <div className="min-h-screen bg-white"></div>;

    return (
        <SidebarLayout>
            <main className="p-8 max-w-7xl mx-auto h-full">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-gray-800">Account Management</h1>
                    <p className="mt-2 text-gray-600">Admin view to control user roles and platform access.</p>
                </div>

                {error && <div className="mb-4 text-red-600 font-medium">{error}</div>}

                <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-100 border-b border-gray-200">
                                <th className="p-4 font-semibold text-gray-700">Full Name</th>
                                <th className="p-4 font-semibold text-gray-700">Email</th>
                                <th className="p-4 font-semibold text-gray-700">Role</th>
                                <th className="p-4 font-semibold text-gray-700 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {accounts.map((acc, idx) => (
                                <tr key={acc.account_id} className={`border-b border-gray-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                                    <td className="p-4 font-medium text-gray-900">{acc.accountName}</td>
                                    <td className="p-4 text-gray-600">{acc.accountEmail}</td>
                                    <td className="p-4">
                                        <select
                                            value={acc.accountRole || 'Student'}
                                            onChange={(e) => handleRoleChange(acc.account_id, e.target.value)}
                                            className="border border-gray-300 rounded px-2 py-1 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                        >
                                            <option value="Student">Student</option>
                                            <option value="Advisers">Advisers</option>
                                            <option value="Admin">Admin</option>
                                        </select>
                                    </td>
                                    <td className="p-4 text-right">
                                        <button
                                            onClick={() => handleDelete(acc.account_id)}
                                            className="text-white bg-red-500 hover:bg-red-600 px-3 py-1.5 rounded text-sm font-medium transition-colors"
                                        >
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {accounts.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="p-8 text-center text-gray-500">No accounts found.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </main>
        </SidebarLayout>
    );
}
