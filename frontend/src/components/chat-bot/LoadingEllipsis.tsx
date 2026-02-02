import React from 'react';

/**
 * Animated ellipsis loading indicator
 * Shows "..." with animated dots when the chatbot is thinking
 */
export default function LoadingEllipsis() {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="animate-pulse delay-0">.</span>
      <span className="animate-pulse delay-200">.</span>
      <span className="animate-pulse delay-400">.</span>
    </span>
  );
}
