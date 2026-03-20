'use client';

import { motion } from 'framer-motion';

interface ProgressBarProps {
  progress: number;
  totalTasks?: number;
  completedTasks?: number;
  className?: string;
}

export default function ProgressBar({ 
  progress, 
  totalTasks, 
  completedTasks,
  className = '' 
}: ProgressBarProps) {
  const clampedProgress = Math.min(Math.max(progress, 0), 100);
  
  const getProgressColor = (value: number) => {
    if (value >= 75) return 'from-green-500 to-emerald-500';
    if (value >= 50) return 'from-blue-500 to-cyan-500';
    if (value >= 25) return 'from-yellow-500 to-orange-500';
    return 'from-red-500 to-pink-500';
  };

  return (
    <div className={`w-full ${className}`}>
      {/* Progress Info */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-700">
            Overall Progress
          </span>
          {totalTasks !== undefined && completedTasks !== undefined && (
            <span className="text-xs text-gray-500">
              ({completedTasks}/{totalTasks} tasks)
            </span>
          )}
        </div>
        <span className="text-lg font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
          {clampedProgress.toFixed(1)}%
        </span>
      </div>

      {/* Progress Bar Container with Glassmorphism */}
      <div className="relative h-3 bg-white/40 backdrop-blur-sm rounded-full overflow-hidden border border-white/60 shadow-inner">
        {/* Animated Progress Fill */}
        <motion.div
          className={`h-full bg-gradient-to-r ${getProgressColor(clampedProgress)} rounded-full relative overflow-hidden`}
          initial={{ width: 0 }}
          animate={{ width: `${clampedProgress}%` }}
          transition={{ 
            duration: 0.8, 
            ease: [0.4, 0, 0.2, 1]
          }}
        >
          {/* Shimmer Effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
          
          {/* Glow Effect */}
          <div className="absolute inset-0 bg-white/20 blur-sm" />
        </motion.div>

        {/* Pulse Effect at Progress Edge */}
        {clampedProgress > 0 && clampedProgress < 100 && (
          <motion.div
            className="absolute top-0 h-full w-1 bg-white/60"
            style={{ left: `${clampedProgress}%` }}
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        )}
      </div>

      {/* Milestone Markers */}
      <div className="relative h-1 mt-1">
        <div className="absolute inset-0 flex justify-between px-1">
          {[25, 50, 75].map((milestone) => (
            <div
              key={milestone}
              className={`w-0.5 h-1 rounded-full transition-colors ${
                clampedProgress >= milestone 
                  ? 'bg-blue-400' 
                  : 'bg-gray-300'
              }`}
              style={{ marginLeft: milestone === 25 ? '25%' : milestone === 50 ? '25%' : '25%' }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
