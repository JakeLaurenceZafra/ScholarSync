export type UserRole = 'admin' | 'manager' | 'member';
export type ThemeMode = 'light' | 'dark';

export interface ThemeColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  surface: string;
  text: string;
  textSecondary: string;
  border: string;
  hover: string;
  success: string;
  warning: string;
  error: string;
  info: string;
}

export interface RoleTheme {
  name: string;
  description: string;
  light: ThemeColors;
  dark: ThemeColors;
}

export const roleThemes: Record<UserRole, RoleTheme> = {
  admin: {
    name: 'Elite Indigo',
    description: 'Authority and Premium Feel',
    light: {
      primary: '#475569',
      secondary: '#312e81',
      accent: '#6366f1',
      background: '#eef2ff',
      surface: '#f8faff',
      text: '#1e1b4b',
      textSecondary: '#4c1d95',
      border: '#c7d2fe',
      hover: '#e0e7ff',
      success: '#10b981',
      warning: '#f59e0b',
      error: '#ef4444',
      info: '#6366f1',
    },
    dark: {
      primary: '#818cf8',
      secondary: '#6366f1',
      accent: '#a5b4fc',
      background: '#0f172a',
      surface: '#1e293b',
      text: '#f1f5f9',
      textSecondary: '#94a3b8',
      border: '#334155',
      hover: '#334155',
      success: '#34d399',
      warning: '#fbbf24',
      error: '#f87171',
      info: '#60a5fa',
    },
  },
  manager: {
    name: 'Professional Teal',
    description: 'Academic Organization and Growth',
    light: {
      primary: '#10b981',
      secondary: '#0d9488',
      accent: '#14b8a6',
      background: '#ecfdf5',
      surface: '#f0fdf9',
      text: '#064e3b',
      textSecondary: '#065f46',
      border: '#a7f3d0',
      hover: '#d1fae5',
      success: '#10b981',
      warning: '#f59e0b',
      error: '#ef4444',
      info: '#14b8a6',
    },
    dark: {
      primary: '#34d399',
      secondary: '#5eead4',
      accent: '#6ee7b7',
      background: '#064e3b',
      surface: '#065f46',
      text: '#f0fdf4',
      textSecondary: '#d1fae5',
      border: '#047857',
      hover: '#047857',
      success: '#34d399',
      warning: '#fbbf24',
      error: '#f87171',
      info: '#60a5fa',
    },
  },
  member: {
    name: 'SkyFlow Classic',
    description: 'Focused Productivity',
    light: {
      primary: '#2563eb',
      secondary: '#0891b2',
      accent: '#06b6d4',
      background: '#f0f9ff',
      surface: '#ffffff',
      text: '#0c4a6e',
      textSecondary: '#0369a1',
      border: '#bae6fd',
      hover: '#e0f2fe',
      success: '#10b981',
      warning: '#f59e0b',
      error: '#ef4444',
      info: '#3b82f6',
    },
    dark: {
      primary: '#60a5fa',
      secondary: '#22d3ee',
      accent: '#38bdf8',
      background: '#0c4a6e',
      surface: '#075985',
      text: '#e0f2fe',
      textSecondary: '#7dd3fc',
      border: '#0369a1',
      hover: '#0369a1',
      success: '#34d399',
      warning: '#fbbf24',
      error: '#f87171',
      info: '#60a5fa',
    },
  },
};

export const getThemeForRole = (role: UserRole, mode: ThemeMode): ThemeColors => {
  return roleThemes[role][mode];
};

export const getRoleThemeName = (role: UserRole): string => {
  return roleThemes[role].name;
};
