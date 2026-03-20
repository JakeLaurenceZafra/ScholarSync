"use client"

import React, { createContext, useContext, useState, useEffect } from 'react'
import { UserRole, ThemeMode, getThemeForRole } from '@/config/themes'

interface ThemeContextType {
  role: UserRole
  mode: ThemeMode
  setRole: (role: UserRole) => void
  setMode: (mode: ThemeMode) => void
  toggleMode: () => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<UserRole>('member')
  const [mode, setMode] = useState<ThemeMode>('light')

  useEffect(() => {
    const savedMode = localStorage.getItem('themeMode') as ThemeMode
    if (savedMode) {
      setMode(savedMode)
    }
  }, [])

  useEffect(() => {
    const theme = getThemeForRole(role, mode)
    const root = document.documentElement

    Object.entries(theme).forEach(([key, value]) => {
      root.style.setProperty(`--color-${key}`, value)
    })

    root.style.setProperty('--text-primary', theme.text)
    root.style.setProperty('--text-secondary', theme.textSecondary)

    localStorage.setItem('themeMode', mode)
  }, [role, mode])

  const toggleMode = () => {
    setMode(prev => prev === 'light' ? 'dark' : 'light')
  }

  return (
    <ThemeContext.Provider value={{ role, mode, setRole, setMode, toggleMode }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
