'use client';

import React from 'react';

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-0">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 px-6 py-4 border-b border-gray-50"
        >
          <div className="skeleton h-4 w-32" />
          <div className="skeleton h-5 w-24 rounded-full" />
          <div className="skeleton h-4 w-48" />
          <div className="flex-1" />
          <div className="skeleton h-4 w-4 rounded" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
}: {
  icon?: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {icon && <div className="mb-4 text-gray-300">{icon}</div>}
      <h3 className="text-sm font-medium text-gray-500 mb-1">{title}</h3>
      <p className="text-xs text-gray-400 max-w-xs">{description}</p>
    </div>
  );
}
