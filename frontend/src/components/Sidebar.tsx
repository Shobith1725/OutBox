'use client';

import React from 'react';
import { Clock, Send, LogOut, Slack } from 'lucide-react';
import { UserResponse, SlackStatusResponse } from '@/types';
import { Button } from '@/components/ui';

interface SidebarProps {
  user: UserResponse;
  activeTab: 'scheduled' | 'sent';
  onTabChange: (tab: 'scheduled' | 'sent') => void;
  onCompose: () => void;
  onLogout: () => void;
  scheduledCount: number;
  sentCount: number;
  slackStatus: SlackStatusResponse | null;
  onSlackConnect: () => void;
  onSlackDisconnect: () => void;
}

export function Sidebar({
  user,
  activeTab,
  onTabChange,
  onCompose,
  onLogout,
  scheduledCount,
  sentCount,
  slackStatus,
  onSlackConnect,
  onSlackDisconnect,
}: SidebarProps) {
  return (
    <div className="w-52 border-r border-gray-100 flex flex-col bg-white h-full">
      {/* Logo */}
      <div className="px-4 pt-5 pb-3">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900" style={{ fontFamily: 'serif' }}>
          ONB
        </h1>
      </div>

      {/* User info */}
      <div className="px-4 py-3 flex items-center gap-2.5">
        {user.avatar ? (
          <img
            src={user.avatar}
            alt={user.name}
            className="w-8 h-8 rounded-full"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 text-sm font-medium">
            {user.name.charAt(0)}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{user.name}</p>
          <p className="text-xs text-gray-400 truncate">{user.email}</p>
        </div>
        <button
          onClick={onLogout}
          className="p-1 text-gray-300 hover:text-gray-500 transition-colors"
          title="Logout"
        >
          <LogOut size={14} />
        </button>
      </div>

      {/* Compose button */}
      <div className="px-4 py-2">
        <Button variant="outline" size="md" className="w-full" onClick={onCompose}>
          Compose
        </Button>
      </div>

      {/* Navigation */}
      <div className="px-3 mt-3">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-1 mb-1">
          Core
        </p>
        <button
          onClick={() => onTabChange('scheduled')}
          className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-md text-sm transition-colors ${
            activeTab === 'scheduled'
              ? 'bg-emerald-50 text-emerald-700 font-medium'
              : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          <Clock size={15} />
          <span>Scheduled</span>
          <span
            className={`ml-auto text-xs px-1.5 py-0.5 rounded-full ${
              activeTab === 'scheduled'
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-gray-100 text-gray-500'
            }`}
          >
            {scheduledCount}
          </span>
        </button>
        <button
          onClick={() => onTabChange('sent')}
          className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-md text-sm transition-colors ${
            activeTab === 'sent'
              ? 'bg-emerald-50 text-emerald-700 font-medium'
              : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          <Send size={15} />
          <span>Sent</span>
          <span
            className={`ml-auto text-xs px-1.5 py-0.5 rounded-full ${
              activeTab === 'sent'
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-gray-100 text-gray-500'
            }`}
          >
            {sentCount}
          </span>
        </button>
      </div>

      {/* Slack integration */}
      <div className="mt-auto px-4 py-4 border-t border-gray-50">
        {slackStatus?.connected ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Slack size={14} className="text-[#4A154B]" />
              <span>Connected to {slackStatus.teamName}</span>
            </div>
            <button
              onClick={onSlackDisconnect}
              className="text-xs text-red-500 hover:text-red-600 transition-colors"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <button
            onClick={onSlackConnect}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
          >
            <Slack size={16} />
            Connect Slack
          </button>
        )}
      </div>
    </div>
  );
}
