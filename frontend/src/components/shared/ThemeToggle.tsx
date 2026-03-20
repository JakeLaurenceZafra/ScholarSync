"use client"

import { Moon, Sun } from "lucide-react"
import { useTheme } from "@/contexts/ThemeContext"

export default function ThemeToggle() {
  const { mode, toggleMode } = useTheme()

  return (
    <button
      onClick={toggleMode}
      className="p-2.5 rounded-xl transition-all duration-300 hover:scale-110"
      style={{
        backgroundColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
      }}
      title={mode === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
    >
      {mode === 'dark' ? (
        <Sun className="w-5 h-5" style={{ color: 'var(--color-text)' }} />
      ) : (
        <Moon className="w-5 h-5" style={{ color: 'var(--color-text)' }} />
      )}
    </button>
  )
}
