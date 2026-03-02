'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import SidebarLayout from '@/components/SidebarLayout';
import { API_URL } from '@/lib/api';
import { jwtDecode } from 'jwt-decode';
import {
    FolderOpen,
    Upload,
    File,
    FileText,
    Image,
    Film,
    MoreVertical,
    Search,
    ExternalLink,
    Loader2,
    AlertCircle,
    RefreshCw
} from 'lucide-react';

type DriveFile = {
    id: string;
    name: string;
    mimeType: string;
    modifiedTime: string;
    size?: string;
};

export default function DrivePage() {
    const [user, setUser] = useState<any>(null);
    const [files, setFiles] = useState<DriveFile[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const router = useRouter();

    useEffect(() => {
        const token = localStorage.getItem('auth_token');
        if (!token) { router.push('/login'); return; }
        try { setUser(jwtDecode(token)); } catch { router.push('/login'); return; }
        fetchFiles(token);
    }, [router]);

    const fetchFiles = async (token?: string) => {
        setLoading(true);
        setError('');
        const t = token || localStorage.getItem('auth_token');
        try {
            const res = await fetch(`${API_URL}/api/drive/files`, {
                headers: { Authorization: `Bearer ${t}` }
            });
            const data = await res.json();
            if (res.ok) {
                setFiles(data.files || []);
            } else {
                setError(data.error || 'Failed to load Drive files');
            }
        } catch {
            setError('Could not connect to Google Drive');
        } finally {
            setLoading(false);
        }
    };

    const getFileIcon = (mimeType: string) => {
        if (mimeType?.includes('spreadsheet')) return <FileText className="w-5 h-5 text-green-500" />;
        if (mimeType?.includes('document')) return <FileText className="w-5 h-5 text-blue-500" />;
        if (mimeType?.includes('presentation')) return <FileText className="w-5 h-5 text-orange-500" />;
        if (mimeType?.includes('pdf')) return <FileText className="w-5 h-5 text-red-500" />;
        if (mimeType?.includes('image')) return <Image className="w-5 h-5 text-purple-500" />;
        if (mimeType?.includes('video')) return <Film className="w-5 h-5 text-pink-500" />;
        if (mimeType?.includes('folder')) return <FolderOpen className="w-5 h-5 text-yellow-500" />;
        return <File className="w-5 h-5 text-gray-500" />;
    };

    const getFileUrl = (file: DriveFile) => {
        if (file.mimeType?.includes('spreadsheet')) return `https://docs.google.com/spreadsheets/d/${file.id}`;
        if (file.mimeType?.includes('document')) return `https://docs.google.com/document/d/${file.id}`;
        if (file.mimeType?.includes('presentation')) return `https://docs.google.com/presentation/d/${file.id}`;
        if (file.mimeType?.includes('folder')) return `https://drive.google.com/drive/folders/${file.id}`;
        return `https://drive.google.com/file/d/${file.id}`;
    };

    const formatSize = (bytes?: string) => {
        if (!bytes) return '';
        const n = parseInt(bytes);
        if (n > 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
        if (n > 1024) return `${(n / 1024).toFixed(0)} KB`;
        return `${n} B`;
    };

    const formatDate = (str: string) => {
        if (!str) return '';
        return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    const filtered = files.filter(f => f.name.toLowerCase().includes(search.toLowerCase()));

    return (
        <SidebarLayout>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Header */}
                <div className="flex items-start justify-between mb-8">
                    <div>
                        <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
                            Google Drive
                        </h1>
                        <p className="text-gray-500 mt-2">Your files and folders from Google Drive</p>
                    </div>
                    <button
                        onClick={() => fetchFiles()}
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
                                    To access Google Drive, <a href="/login" className="underline font-medium">sign in again</a> so we can request Drive permissions.
                                    Also ensure the Google Drive API and Sheets API are enabled in Google Cloud Console, and the required scopes are added.
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
                        placeholder="Search files..."
                        className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>

                {loading ? (
                    <div className="flex items-center justify-center h-40">
                        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                    </div>
                ) : (
                    <div className="glass-card overflow-hidden">
                        {filtered.length === 0 ? (
                            <div className="p-12 text-center text-gray-400">
                                <FolderOpen className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                                <p>No files found</p>
                            </div>
                        ) : (
                            filtered.map((file, idx) => (
                                <a
                                    key={file.id}
                                    href={getFileUrl(file)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`flex items-center justify-between px-5 py-4 hover:bg-blue-50/30 transition-colors cursor-pointer group ${idx < filtered.length - 1 ? 'border-b border-gray-100' : ''}`}
                                >
                                    <div className="flex items-center gap-4">
                                        {getFileIcon(file.mimeType)}
                                        <div>
                                            <p className="font-medium text-gray-800 text-sm group-hover:text-blue-600 transition-colors">{file.name}</p>
                                            <p className="text-xs text-gray-400 mt-0.5">
                                                {formatSize(file.size)}{file.size ? ' · ' : ''}{formatDate(file.modifiedTime)}
                                            </p>
                                        </div>
                                    </div>
                                    <ExternalLink className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </a>
                            ))
                        )}
                    </div>
                )}

                {/* Scope info */}
                {!error && !loading && files.length > 0 && (
                    <p className="text-xs text-gray-400 mt-4 text-center">
                        Showing files from your Google Drive · <a href={`https://drive.google.com`} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">Open Google Drive</a>
                    </p>
                )}
            </div>
        </SidebarLayout>
    );
}
