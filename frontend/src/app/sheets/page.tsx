'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import SidebarLayout from '@/components/SidebarLayout';
import { API_URL } from '@/lib/api';
import { jwtDecode } from 'jwt-decode';
import {
    FileSpreadsheet,
    Search,
    ExternalLink,
    Clock,
    Loader2,
    AlertCircle,
    RefreshCw,
    Table
} from 'lucide-react';

type Sheet = {
    id: string;
    name: string;
    modifiedTime: string;
    owners?: Array<{ displayName: string }>;
};

export default function SheetsPage() {
    const [user, setUser] = useState<any>(null);
    const [sheets, setSheets] = useState<Sheet[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const router = useRouter();

    useEffect(() => {
        const token = localStorage.getItem('auth_token');
        if (!token) { router.push('/login'); return; }
        try { setUser(jwtDecode(token)); } catch { router.push('/login'); return; }
        fetchSheets(token);
    }, [router]);

    const fetchSheets = async (token?: string) => {
        setLoading(true);
        setError('');
        const t = token || localStorage.getItem('auth_token');
        try {
            const res = await fetch(`${API_URL}/api/sheets/list`, {
                headers: { Authorization: `Bearer ${t}` }
            });
            const data = await res.json();
            if (res.ok) {
                setSheets(data.files || []);
            } else {
                setError(data.error || 'Failed to load Google Sheets');
            }
        } catch {
            setError('Could not connect to Google Sheets');
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (str: string) => {
        if (!str) return '';
        return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    const gradients = [
        'from-green-500 to-emerald-500',
        'from-blue-500 to-cyan-500',
        'from-purple-500 to-pink-500',
        'from-orange-500 to-red-500',
        'from-teal-500 to-green-500'
    ];

    const filtered = sheets.filter(s => s.name.toLowerCase().includes(search.toLowerCase()));

    return (
        <SidebarLayout>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Header */}
                <div className="flex items-start justify-between mb-8">
                    <div>
                        <h1 className="text-4xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                            Google Sheets
                        </h1>
                        <p className="text-gray-500 mt-2">Your spreadsheets from Google Drive</p>
                    </div>
                    <button
                        onClick={() => fetchSheets()}
                        className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-all text-sm font-medium"
                    >
                        <RefreshCw className="w-4 h-4" /> Refresh
                    </button>
                </div>

                {/* Error */}
                {error && (
                    <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3 text-amber-800 text-sm">
                        <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="font-medium">{error}</p>
                            {error.includes('re-login') && (
                                <p className="mt-1 text-amber-700">
                                    To access Google Sheets, <a href="/login" className="underline font-medium">sign in again</a> — we need Drive and Sheets permissions.
                                    Also ensure the Google Sheets API is enabled in Cloud Console with the required scopes.
                                </p>
                            )}
                        </div>
                    </div>
                )}

                {/* Search */}
                <div className="relative mb-6 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search spreadsheets..."
                        className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>

                {loading ? (
                    <div className="flex items-center justify-center h-40">
                        <Loader2 className="w-8 h-8 animate-spin text-green-500" />
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="glass-card p-12 text-center">
                        <Table className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500 font-medium">No spreadsheets found</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        {filtered.map((sheet, idx) => (
                            <a
                                key={sheet.id}
                                href={`https://docs.google.com/spreadsheets/d/${sheet.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="glass-card p-5 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 group cursor-pointer"
                            >
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2.5 bg-gradient-to-br ${gradients[idx % gradients.length]} rounded-xl shadow-md`}>
                                            <FileSpreadsheet className="w-5 h-5 text-white" />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-gray-800 group-hover:text-green-600 transition-colors text-sm leading-snug">{sheet.name}</h3>
                                            {sheet.owners?.[0] && (
                                                <p className="text-xs text-gray-400 mt-0.5">By {sheet.owners[0].displayName}</p>
                                            )}
                                        </div>
                                    </div>
                                    <ExternalLink className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                                </div>
                                <div className="flex items-center gap-1.5 text-xs text-gray-500 pt-3 border-t border-gray-100">
                                    <Clock className="w-3.5 h-3.5" />
                                    <span>Modified {formatDate(sheet.modifiedTime)}</span>
                                </div>
                            </a>
                        ))}
                    </div>
                )}

                {!error && !loading && sheets.length > 0 && (
                    <p className="text-xs text-gray-400 mt-6 text-center">
                        Showing {sheets.length} spreadsheet{sheets.length !== 1 ? 's' : ''} from Google Drive
                    </p>
                )}
            </div>
        </SidebarLayout>
    );
}
