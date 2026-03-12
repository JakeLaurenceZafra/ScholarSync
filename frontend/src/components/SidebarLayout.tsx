'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { jwtDecode } from 'jwt-decode';
import {
    LayoutDashboard,
    BookOpen,
    FolderOpen,
    FileSpreadsheet,
    FolderSync,
    Users,
    Settings,
    LogOut,
    Menu,
    X,
    ChevronDown,
    GraduationCap,
    Shield,
    CalendarDays
} from 'lucide-react';

interface SidebarLayoutProps {
    children: React.ReactNode;
}

export default function SidebarLayout({ children }: SidebarLayoutProps) {
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [user, setUser] = useState<any>(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const pathname = usePathname();
    const router = useRouter();

    useEffect(() => {
        const token = localStorage.getItem('auth_token');
        if (token) {
            try {
                const decoded: any = jwtDecode(token);
                setUser(decoded);
                setIsAdmin(decoded.role === 'Admin');
            } catch (e) {
                // Invalid token
            }
        }
    }, []);

    const handleLogout = () => {
        localStorage.removeItem('auth_token');
        router.push('/login');
    };

    const navItems = [
        { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { href: '/courses', label: 'Courses', icon: BookOpen },
        { href: '/calendar', label: 'Calendar', icon: CalendarDays },
        { href: '/workspace-sync', label: 'Workspace Sync', icon: FolderSync },
    ];



    const isActive = (href: string) => pathname === href || pathname?.startsWith(href + '/');

    const NavLink = ({ href, label, icon: Icon }: { href: string; label: string; icon: any }) => (
        <Link
            href={href}
            onClick={() => setIsMobileMenuOpen(false)}
            className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-300 group shadow-sm hover:shadow-md ${isActive(href)
                ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-md'
                : 'text-gray-700 hover:bg-gradient-to-r hover:from-blue-500 hover:to-cyan-500 hover:text-white'
                }`}
        >
            <Icon className={`w-5 h-5 transition-colors ${isActive(href) ? 'text-white' : 'group-hover:text-white'}`} />
            <span>{label}</span>
        </Link>
    );

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 relative overflow-hidden">
            {/* Floating cloud decorations */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
                <div className="absolute top-20 animate-cloud-1 opacity-[0.03]">
                    <div className="w-64 h-24 bg-blue-400 rounded-full blur-2xl" />
                </div>
                <div className="absolute top-60 animate-cloud-2 opacity-[0.04]">
                    <div className="w-48 h-20 bg-cyan-400 rounded-full blur-2xl" />
                </div>
                <div className="absolute top-96 animate-cloud-3 opacity-[0.03]">
                    <div className="w-72 h-28 bg-blue-300 rounded-full blur-2xl" />
                </div>
            </div>

            {/* Desktop Header */}
            <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-xl border-b border-white/40 shadow-sm">
                <div className="flex items-center justify-between px-6 h-16">
                    <div className="flex items-center gap-4">
                        {/* Mobile menu button */}
                        <button
                            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                            className="lg:hidden p-2 text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100"
                        >
                            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                        </button>

                        {/* Logo */}
                        <Link href="/dashboard" className="flex items-center gap-3">
                            <div className="p-2 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl shadow-md">
                                <GraduationCap className="w-6 h-6 text-white" />
                            </div>
                            <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent font-[family-name:var(--font-lilita)] tracking-wide hidden sm:block">
                                ScholarSync
                            </span>
                        </Link>
                    </div>

                    {/* Right side - user info */}
                    <div className="flex items-center gap-4">
                        {user && (
                            <div className="flex items-center gap-3">
                                <div className="hidden sm:block text-right">
                                    <p className="text-sm font-semibold text-gray-800">{user.email?.split('@')[0]}</p>
                                    <p className="text-xs text-gray-500 capitalize">{user.role}</p>
                                </div>
                                <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-md">
                                    {user.email?.charAt(0).toUpperCase()}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            <div className="flex relative z-10">
                {/* Desktop Sidebar */}
                <aside className={`hidden lg:block sticky top-16 h-[calc(100vh-4rem)] transition-all duration-300 ${isSidebarOpen ? 'w-64' : 'w-20'}`}>
                    <div className="h-full bg-white/60 backdrop-blur-xl border-r border-white/40 p-4 flex flex-col">
                        {/* Toggle */}
                        <button
                            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                            className="self-end mb-4 p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
                        >
                            <ChevronDown className={`w-4 h-4 transition-transform ${isSidebarOpen ? 'rotate-90' : '-rotate-90'}`} />
                        </button>

                        {/* Main nav */}
                        <nav className="space-y-2">
                            {navItems.map(item => (
                                isSidebarOpen ? (
                                    <NavLink key={item.href} {...item} />
                                ) : (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        className={`flex items-center justify-center p-3 rounded-xl transition-all duration-300 ${isActive(item.href)
                                            ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-md'
                                            : 'text-gray-500 hover:bg-gray-100'
                                            }`}
                                        title={item.label}
                                    >
                                        <item.icon className="w-5 h-5" />
                                    </Link>
                                )
                            ))}
                        </nav>



                        {/* Admin link */}
                        {isAdmin && isSidebarOpen && (
                            <div className="mt-6 pt-6 border-t border-gray-200">
                                <NavLink href="/admin/accounts" label="Accounts" icon={Shield} />
                            </div>
                        )}

                        {/* Bottom section */}
                        <div className="mt-auto pt-6 border-t border-gray-200">
                            {isSidebarOpen ? (
                                <button
                                    onClick={handleLogout}
                                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-red-600 rounded-xl hover:bg-red-50 transition-all duration-300 group"
                                >
                                    <LogOut className="w-5 h-5" />
                                    <span>Log Out</span>
                                </button>
                            ) : (
                                <button
                                    onClick={handleLogout}
                                    className="flex items-center justify-center p-3 text-red-500 rounded-xl hover:bg-red-50 transition-all w-full"
                                    title="Log Out"
                                >
                                    <LogOut className="w-5 h-5" />
                                </button>
                            )}
                        </div>
                    </div>
                </aside>

                {/* Mobile Sidebar Overlay */}
                {isMobileMenuOpen && (
                    <div className="fixed inset-0 z-40 lg:hidden">
                        <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)} />
                        <div className="absolute left-0 top-0 bottom-0 w-72 bg-white shadow-2xl p-6 flex flex-col animate-slide-up">
                            <div className="flex items-center gap-3 mb-8">
                                <div className="p-2 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl">
                                    <GraduationCap className="w-6 h-6 text-white" />
                                </div>
                                <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">ScholarSync</span>
                            </div>

                            <nav className="space-y-2 flex-1">
                                {navItems.map(item => <NavLink key={item.href} {...item} />)}

                                {isAdmin && (
                                    <div className="pt-4 border-t border-gray-200 mt-4">
                                        <NavLink href="/admin/accounts" label="Accounts" icon={Shield} />
                                    </div>
                                )}
                            </nav>

                            <button onClick={handleLogout} className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-red-600 rounded-xl hover:bg-red-50 transition-all">
                                <LogOut className="w-5 h-5" />
                                <span>Log Out</span>
                            </button>
                        </div>
                    </div>
                )}

                {/* Main Content */}
                <main className="flex-1 min-h-[calc(100vh-4rem)]">
                    {children}
                </main>
            </div>
        </div>
    );
}
