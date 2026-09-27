'use client';

import React from 'react';
import { Star, Mail, Clock } from 'lucide-react';
import { ScheduledEmailResponse } from '@/types';
import { TableSkeleton, EmptyState } from '@/components/ui';

interface EmailListProps {
  emails: ScheduledEmailResponse[];
  loading: boolean;
  type: 'scheduled' | 'sent';
}

function formatDateTime(isoString: string): string {
  const date = new Date(isoString);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const day = days[date.getDay()];
  const hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const h12 = hours % 12 || 12;
  return `${day} ${h12}:${minutes}:${seconds} ${ampm}`;
}

function StatusBadge({ status, dateStr }: { status: string; dateStr?: string }) {
  if (status === 'sent') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
        Sent
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-600 border border-red-200">
        Failed
      </span>
    );
  }
  if (status === 'processing') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-600 border border-blue-200">
        Processing
      </span>
    );
  }
  // pending — show scheduled time with orange badge
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-orange-50 text-orange-600 border border-orange-200">
      <Clock size={10} />
      {dateStr ? formatDateTime(dateStr) : 'Scheduled'}
    </span>
  );
}

export function EmailList({ emails, loading, type }: EmailListProps) {
  if (loading) {
    return <TableSkeleton rows={6} />;
  }

  if (emails.length === 0) {
    return (
      <EmptyState
        icon={<Mail size={40} />}
        title={type === 'scheduled' ? 'No scheduled emails' : 'No sent emails yet'}
        description={
          type === 'scheduled'
            ? 'Schedule your first email campaign using the Compose button'
            : 'Emails will appear here once they have been sent'
        }
      />
    );
  }

  return (
    <div className="divide-y divide-gray-50">
      {emails.map((email) => (
        <div
          key={email.id}
          onClick={() => {
            if (email.previewUrl) window.open(email.previewUrl, '_blank');
          }}
          className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50/50 transition-colors cursor-pointer group"
        >
          {/* Recipient */}
          <div className="w-40 shrink-0">
            <p className="text-sm font-medium text-gray-800 truncate">
              To: {email.recipientEmail.split('@')[0]}
            </p>
          </div>

          {/* Status badge */}
          <div className="shrink-0">
            {type === 'scheduled' ? (
              <StatusBadge status={email.status} dateStr={email.scheduledAt} />
            ) : (
              <StatusBadge status={email.status} />
            )}
          </div>

          {/* Subject + preview */}
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <span className="text-sm font-medium text-gray-800 truncate">
              {email.subject}
            </span>
            <span className="text-sm text-gray-400 truncate hidden sm:inline">
              - {email.body?.replace(/<[^>]*>/g, '').substring(0, 60)}...
            </span>
          </div>

          {/* Preview URL for sent emails */}
          {email.previewUrl && (
            <a
              href={email.previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-emerald-600 hover:text-emerald-700 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => e.stopPropagation()}
            >
              Preview
            </a>
          )}

          {/* Star icon */}
          <button className="p-1 text-gray-200 hover:text-yellow-400 shrink-0 transition-colors">
            <Star size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
