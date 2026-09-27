'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, Filter, RefreshCw } from 'lucide-react';
import { UserResponse, SenderResponse, ScheduledEmailResponse, SlackStatusResponse } from '@/types';
import {
  getCurrentUser,
  logout,
  getSenders,
  getScheduledEmails,
  getSentEmails,
  getSlackStatus,
  getSlackConnectUrl,
  disconnectSlack,
  searchEmails,
} from '@/lib/api';
import { Sidebar } from '@/components/Sidebar';
import { EmailList } from '@/components/EmailList';
import { ComposeEmail } from '@/components/ComposeEmail';
import toast from 'react-hot-toast';

export default function DashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // State
  const [user, setUser] = useState<UserResponse | null>(null);
  const [senders, setSenders] = useState<SenderResponse[]>([]);
  const [activeTab, setActiveTab] = useState<'scheduled' | 'sent'>('scheduled');
  const [scheduledEmails, setScheduledEmails] = useState<ScheduledEmailResponse[]>([]);
  const [sentEmails, setSentEmails] = useState<ScheduledEmailResponse[]>([]);
  const [scheduledTotal, setScheduledTotal] = useState(0);
  const [sentTotal, setSentTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCompose, setShowCompose] = useState(false);
  const [slackStatus, setSlackStatus] = useState<SlackStatusResponse | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Auth check
  useEffect(() => {
    getCurrentUser()
      .then((u) => setUser(u))
      .catch(() => router.push('/login'));
  }, [router]);

  // Check for Slack callback params
  useEffect(() => {
    const slackParam = searchParams.get('slack');
    if (slackParam === 'connected') {
      toast.success('Slack connected successfully!');
      // Clean URL
      window.history.replaceState({}, '', '/dashboard');
    } else if (slackParam === 'error') {
      const reason = searchParams.get('reason') || 'Unknown error';
      toast.error(`Slack connection failed: ${reason}`);
      window.history.replaceState({}, '', '/dashboard');
    }
  }, [searchParams]);

  // Load data
  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      const [sendersData, scheduledData, sentData, slackData] = await Promise.all([
        getSenders(),
        getScheduledEmails(1),
        getSentEmails(1),
        getSlackStatus().catch(() => ({ connected: false } as SlackStatusResponse)),
      ]);

      setSenders(sendersData);
      setScheduledEmails(scheduledData.data);
      setScheduledTotal(scheduledData.total);
      setSentEmails(sentData.data);
      setSentTotal(sentData.total);
      setSlackStatus(slackData);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) loadData();
  }, [user, loadData]);

  // Search handler
  const handleSearch = useCallback(
    async (query: string) => {
      setSearchQuery(query);
      if (!query.trim()) {
        loadData();
        return;
      }

      setLoading(true);
      try {
        if (activeTab === 'scheduled') {
          const result = await getScheduledEmails(1, query);
          setScheduledEmails(result.data);
          setScheduledTotal(result.total);
        } else {
          const result = await getSentEmails(1, query);
          setSentEmails(result.data);
          setSentTotal(result.total);
        }
      } catch (err) {
        console.error('Search failed:', err);
      } finally {
        setLoading(false);
      }
    },
    [activeTab, loadData]
  );

  // Refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
    toast.success('Refreshed');
  };

  // Logout
  const handleLogout = async () => {
    try {
      await logout();
      router.push('/login');
    } catch {
      router.push('/login');
    }
  };

  // Slack connect/disconnect
  const handleSlackConnect = () => {
    window.location.href = getSlackConnectUrl();
  };

  const handleSlackDisconnect = async () => {
    try {
      await disconnectSlack();
      setSlackStatus({ connected: false });
      toast.success('Slack disconnected');
    } catch (err: any) {
      toast.error(err.message || 'Failed to disconnect Slack');
    }
  };

  // Loading state
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  // Compose view
  if (showCompose) {
    return (
      <ComposeEmail
        senders={senders}
        onClose={() => setShowCompose(false)}
        onScheduled={loadData}
      />
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Top dark header bar */}
      <div className="h-8 bg-gray-900 w-full flex items-center px-4">
        <span className="text-gray-400 text-xs">Homepage</span>
      </div>

      {/* Main layout */}
      <div className="flex flex-1" style={{ height: 'calc(100vh - 32px)' }}>
        {/* Sidebar */}
        <Sidebar
          user={user}
          activeTab={activeTab}
          onTabChange={(tab) => {
            setActiveTab(tab);
            setSearchQuery('');
          }}
          onCompose={() => setShowCompose(true)}
          onLogout={handleLogout}
          scheduledCount={scheduledTotal}
          sentCount={sentTotal}
          slackStatus={slackStatus}
          onSlackConnect={handleSlackConnect}
          onSlackDisconnect={handleSlackDisconnect}
        />

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Search bar */}
          <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100">
            <div className="flex-1 relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search"
                className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm outline-none focus:border-emerald-400 focus:bg-white transition-colors placeholder-gray-400"
              />
            </div>
            <button className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
              <Filter size={16} />
            </button>
            <button
              className={`p-2 text-gray-400 hover:text-gray-600 transition-colors ${
                isRefreshing ? 'animate-spin' : ''
              }`}
              onClick={handleRefresh}
            >
              <RefreshCw size={16} />
            </button>
          </div>

          {/* Email list */}
          <div className="flex-1 overflow-y-auto">
            {activeTab === 'scheduled' ? (
              <EmailList emails={scheduledEmails} loading={loading} type="scheduled" />
            ) : (
              <EmailList emails={sentEmails} loading={loading} type="sent" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
