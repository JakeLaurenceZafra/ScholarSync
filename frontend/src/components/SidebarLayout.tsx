'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
    Cloud, 
    LogOut, 
    Menu, 
    X, 
    Calendar, 
    BarChart3, 
    Users, 
    FolderKanban, 
    ChevronDown, 
    Shield,
    LayoutDashboard,
    RefreshCw
} from 'lucide-react';
import { jwtDecode } from 'jwt-decode';
import ThemeToggle from './shared/ThemeToggle';

export default function SidebarLayout({ children }: { children: React.ReactNode }) {
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isAdmin, setIsAdmin] = useState(false);
    const [userRole, setUserRole] = useState('');
    const [userEmail, setUserEmail] = useState('');
    const pathname = usePathname();
    const router = useRouter();

    useEffect(() => {
        const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
        if (token) {
            try {
                const decoded: any = jwtDecode(token);
                setIsAdmin(decoded.role === 'Admin');
                setUserRole(decoded.role || '');
                setUserEmail(decoded.email || '');
            } catch (e) {
                console.error('Failed to decode token:', e);
            }
        }
    }, []);

    const handleLogout = () => {
        localStorage.removeItem('auth_token');
        router.push('/login');
    };

    const navItems = [
        { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { href: '/courses', label: 'Courses', icon: FolderKanban },
        { href: '/calendar', label: 'Calendar', icon: Calendar },
        { href: '/workspace-sync', label: 'Workspace Sync', icon: RefreshCw },
        ...(userRole === 'Adviser' || userRole === 'Admin' ? [{ href: '/schedule', label: 'My Schedule', icon: Calendar }] : []),
        ...(userRole === 'Student' ? [{ href: '/booking', label: 'Booking', icon: Calendar }] : []),
    ];

    const isActive = (path: string) => pathname === path;

    const NavLink = ({ href, label, icon: Icon }: { href: string; label: string; icon: any }) => (
        <Link
            href={href}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-300 group shadow-sm hover:shadow-md"
            style={{
                background: isActive(href) ? 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))' : 'transparent',
                color: isActive(href) ? '#ffffff' : 'var(--color-text)'
            }}
            onMouseEnter={(e) => {
                if (!isActive(href)) {
                    e.currentTarget.style.backgroundColor = 'var(--color-hover)';
                }
            }}
            onMouseLeave={(e) => {
                if (!isActive(href)) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                }
            }}
        >
            <Icon className="w-5 h-5 transition-colors" style={{ color: isActive(href) ? '#ffffff' : 'var(--color-text)' }} />
            <span>{label}</span>
        </Link>
    );

    return (
        <div className="min-h-screen relative overflow-hidden font-sans transition-colors duration-300" style={{ backgroundColor: 'var(--color-background)' }}>
            {/* Animated Background Elements (SkyFlow Style) */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-20 left-10 w-72 h-72 bg-blue-200/30 rounded-full blur-3xl animate-float-slow"></div>
                <div className="absolute top-40 right-20 w-96 h-96 bg-cyan-200/30 rounded-full blur-3xl animate-bounce-slow"></div>
                <div className="absolute bottom-20 left-1/3 w-80 h-80 bg-purple-200/20 rounded-full blur-3xl animate-wave"></div>
            </div>

            {/* Header */}
            <header className="sticky top-0 z-40 shadow-lg backdrop-blur-xl transition-colors duration-300" style={{ backgroundColor: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)' }}>
                <div className="px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            {/* Mobile Menu Toggle */}
                            <button 
                                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} 
                                className="lg:hidden p-2 rounded-lg transition-colors"
                                style={{ color: 'var(--color-text)' }}
                            >
                                {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                            </button>

                            {/* Branding */}
                            <Link href="/dashboard" className="flex items-center gap-3 group">
                                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform duration-300">
                                    <Cloud className="w-6 h-6 text-white" />
                                </div>
                                <div className="flex flex-col">
                                    <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent font-[family-name:var(--font-lilita)] tracking-wide">
                                        ScholarSync
                                    </h1>
                                    <p className="text-[10px] text-gray-500 font-medium uppercase tracking-widest leading-none">
                                        Academic Management
                                    </p>
                                </div>
                            </Link>
                        </div>

                        {/* Desktop Header Actions */}
                        <div className="hidden md:flex items-center gap-6">
                            <div className="flex flex-col items-end">
                                <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{userEmail.split('@')[0] || 'User'}</p>
                                <p className="text-xs" style={{ color: 'var(--color-textSecondary)' }}>{isAdmin ? 'Admin' : 'Student'}</p>
                            </div>
                            <ThemeToggle />
                            <button 
                                onClick={handleLogout} 
                                className="p-2.5 hover:bg-red-50 rounded-xl transition-all duration-300 group"
                                title="Sign Out"
                            >
                                <LogOut className="w-5 h-5 text-gray-400 group-hover:text-red-500 transition-colors" />
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            <div className="flex relative z-30">
                {/* Desktop Sidebar */}
                <aside className={`hidden lg:flex lg:flex-col sticky top-[73px] h-[calc(100vh-73px)] backdrop-blur-xl transition-all duration-300 shadow-xl ${isSidebarOpen ? 'w-64' : 'w-20'}`} style={{ backgroundColor: 'var(--color-surface)', borderRight: '1px solid var(--color-border)' }}>
                    <div className="p-4 flex flex-col h-full">
                        {/* Sidebar Toggle */}
                        <button 
                            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                            className="self-end mb-6 p-1.5 rounded-lg transition-all"
                            style={{ color: 'var(--color-textSecondary)' }}
                        >
                            <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${isSidebarOpen ? 'rotate-90' : '-rotate-90'}`} />
                        </button>

                        {/* Nav Items */}
                        <nav className="space-y-3">
                            {navItems.map((item) => (
                                isSidebarOpen ? (
                                    <NavLink key={item.href} {...item} />
                                ) : (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        className="flex items-center justify-center p-3 rounded-xl transition-all duration-300"
                                        style={{
                                            background: isActive(item.href) ? 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))' : 'transparent',
                                            color: isActive(item.href) ? '#ffffff' : 'var(--color-text)'
                                        }}
                                        title={item.label}
                                    >
                                        <item.icon className="w-5 h-5" />
                                    </Link>
                                )
                            ))}
                        </nav>

                        {/* Admin Section */}
                        {isAdmin && isSidebarOpen && (
                            <div className="mt-8 pt-6" style={{ borderTop: '1px solid var(--color-border)' }}>
                                <h2 className="text-[10px] font-bold uppercase tracking-widest mb-4 px-4" style={{ color: 'var(--color-textSecondary)' }}>Admin Panel</h2>
                                <NavLink href="/admin/accounts" label="Accounts" icon={Shield} />
                            </div>
                        )}

                    </div>
                </aside>

                {/* Mobile Sidebar Overlay */}
                {isMobileMenuOpen && (
                    <div className="fixed inset-0 z-50 lg:hidden">
                        <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)} />
                        <aside className="absolute left-0 top-0 bottom-0 w-72 backdrop-blur-xl shadow-2xl p-6 flex flex-col animate-in slide-in-from-left duration-300" style={{ backgroundColor: 'var(--color-surface)' }}>
                            <div className="flex items-center gap-3 mb-10">
                                <div className="p-2 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl shadow-md">
                                    <Cloud className="w-6 h-6 text-white" />
                                </div>
                                <span className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent font-[family-name:var(--font-lilita)]">
                                    ScholarSync
                                </span>
                            </div>

                            <nav className="space-y-3 flex-1">
                                {navItems.map((item) => (
                                    <NavLink key={item.href} {...item} />
                                ))}
                                
                                {isAdmin && (
                                    <div className="pt-6 mt-6" style={{ borderTop: '1px solid var(--color-border)' }}>
                                        <NavLink href="/admin/accounts" label="Accounts" icon={Shield} />
                                    </div>
                                )}
                            </nav>

                        </aside>
                    </div>
                )}

                {/* Main Content Area */}
                <main className="flex-1 h-[calc(100vh-73px)] overflow-y-auto">
                    <div className="p-4 sm:p-6 lg:p-8">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
}
