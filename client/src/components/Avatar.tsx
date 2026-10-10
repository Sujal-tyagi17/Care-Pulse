import React, { useState } from 'react';

const initials = (name: string) =>
  name
    .replace(/^Dr\.?\s+/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

/** Photo with an initials fallback, so a missing or blocked image never shows broken alt text. */
export const Avatar: React.FC<{ src?: string | null; name: string; className?: string }> = ({ src, name, className = 'w-10 h-10' }) => {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span
        aria-hidden="true"
        className={`inline-flex shrink-0 items-center justify-center rounded-full bg-primary-soft text-on-primary-soft font-heading font-bold text-sm ${className}`}
      >
        {initials(name)}
      </span>
    );
  }
  return <img src={src} alt="" onError={() => setFailed(true)} className={`shrink-0 rounded-full object-cover ${className}`} />;
};
