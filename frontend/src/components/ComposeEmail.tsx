'use client';

import React, { useState, useRef, useCallback } from 'react';
import { ArrowLeft, Paperclip, Clock, Upload, X } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { SenderResponse } from '@/types';
import { scheduleEmails, uploadCsv } from '@/lib/api';
import toast from 'react-hot-toast';

interface ComposeEmailProps {
  senders: SenderResponse[];
  onClose: () => void;
  onScheduled: () => void;
}

export function ComposeEmail({ senders, onClose, onScheduled }: ComposeEmailProps) {
  const [selectedSender, setSelectedSender] = useState(senders[0]?.id || '');
  const [recipients, setRecipients] = useState<string[]>([]);
  const [recipientInput, setRecipientInput] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [delayBetween, setDelayBetween] = useState('00');
  const [hourlyLimit, setHourlyLimit] = useState('00');
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedSenderObj = senders.find((s) => s.id === selectedSender);

  // Add email when Enter or comma is pressed
  const handleRecipientKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addRecipient(recipientInput);
    }
  };

  const addRecipient = (email: string) => {
    const trimmed = email.trim().replace(',', '').toLowerCase();
    if (trimmed && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) && !recipients.includes(trimmed)) {
      setRecipients((prev) => [...prev, trimmed]);
    }
    setRecipientInput('');
  };

  const removeRecipient = (email: string) => {
    setRecipients((prev) => prev.filter((r) => r !== email));
  };

  // CSV Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const result = await uploadCsv(file);
      setRecipients((prev) => {
        const combined = [...new Set([...prev, ...result.emails])];
        return combined;
      });
      toast.success(`Added ${result.count} emails from file`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to parse file');
    }

    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Quick time presets
  const getQuickTime = (preset: string): { date: string; time: string } => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];

    switch (preset) {
      case 'tomorrow-10':
        return { date: dateStr, time: '10:00' };
      case 'tomorrow-11':
        return { date: dateStr, time: '11:00' };
      case 'tomorrow-15':
        return { date: dateStr, time: '15:00' };
      default:
        return { date: dateStr, time: '10:00' };
    }
  };

  // Schedule handler
  const handleSchedule = useCallback(async () => {
    if (!subject.trim()) {
      toast.error('Subject is required');
      return;
    }
    if (!body.trim()) {
      toast.error('Email body is required');
      return;
    }
    if (recipients.length === 0) {
      toast.error('At least one recipient is required');
      return;
    }
    if (!selectedSender) {
      toast.error('Please select a sender');
      return;
    }
    if (!scheduleDate || !scheduleTime) {
      toast.error('Please pick a date and time');
      return;
    }

    const startTime = new Date(`${scheduleDate}T${scheduleTime}:00`);
    if (startTime <= new Date()) {
      toast.error('Scheduled time must be in the future');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await scheduleEmails({
        subject,
        body,
        senderId: selectedSender,
        recipients,
        startTime: startTime.toISOString(),
        delayBetweenEmailsMs: (parseInt(delayBetween) || 0) * 1000,
        maxEmailsPerHour: parseInt(hourlyLimit) || 100,
      });

      toast.success(`Scheduled ${result.jobsCreated} emails successfully!`);
      onScheduled();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to schedule emails');
    } finally {
      setIsSubmitting(false);
    }
  }, [subject, body, recipients, selectedSender, scheduleDate, scheduleTime, delayBetween, hourlyLimit, onScheduled, onClose]);

  // Send immediately
  const handleSendNow = useCallback(async () => {
    if (!subject.trim()) {
      toast.error('Subject is required');
      return;
    }
    if (!body.trim()) {
      toast.error('Email body is required');
      return;
    }
    if (recipients.length === 0) {
      toast.error('At least one recipient is required');
      return;
    }

    setIsSubmitting(true);
    try {
      const startTime = new Date(Date.now() + 5000); // 5 seconds from now
      const result = await scheduleEmails({
        subject,
        body,
        senderId: selectedSender,
        recipients,
        startTime: startTime.toISOString(),
        delayBetweenEmailsMs: (parseInt(delayBetween) || 0) * 1000,
        maxEmailsPerHour: parseInt(hourlyLimit) || 100,
      });

      toast.success(`Sending ${result.jobsCreated} emails now!`);
      onScheduled();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to send emails');
    } finally {
      setIsSubmitting(false);
    }
  }, [subject, body, recipients, selectedSender, delayBetween, hourlyLimit, onScheduled, onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {/* Top bar */}
      <div className="h-8 bg-gray-900 w-full flex items-center px-4">
        <span className="text-gray-400 text-xs">Homepage</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-lg font-semibold text-gray-900">Compose New Email</h1>
        </div>
        <div className="flex items-center gap-2">
          <button className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
            <Paperclip size={18} />
          </button>
          <button
            className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
            onClick={() => setShowSchedulePicker(!showSchedulePicker)}
          >
            <Clock size={18} />
          </button>
          {showSchedulePicker ? (
            <Button
              variant="outline"
              size="md"
              onClick={handleSchedule}
              loading={isSubmitting}
            >
              Send Later
            </Button>
          ) : (
            <Button
              variant="outline"
              size="md"
              onClick={handleSendNow}
              loading={isSubmitting}
            >
              Send
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Main compose area */}
        <div className="flex-1 flex flex-col px-8 py-6 overflow-y-auto">
          {/* From */}
          <div className="flex items-center gap-4 mb-4">
            <label className="text-sm text-gray-500 w-16">From</label>
            <select
              value={selectedSender}
              onChange={(e) => setSelectedSender(e.target.value)}
              className="bg-gray-100 border border-gray-200 rounded-md px-3 py-1.5 text-sm text-gray-700 outline-none focus:border-emerald-400"
            >
              {senders.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.displayName} ({s.fromEmail})
                </option>
              ))}
            </select>
          </div>

          {/* To */}
          <div className="flex items-start gap-4 mb-4">
            <label className="text-sm text-gray-500 w-16 pt-2">To</label>
            <div className="flex-1 flex flex-wrap items-center gap-1.5 min-h-[40px]">
              {recipients.slice(0, 3).map((email) => (
                <span
                  key={email}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 border border-emerald-200 rounded-full text-xs text-emerald-700"
                >
                  {email}
                  <button
                    onClick={() => removeRecipient(email)}
                    className="text-emerald-400 hover:text-emerald-700"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
              {recipients.length > 3 && (
                <span className="inline-flex items-center px-2.5 py-1 bg-gray-100 border border-gray-200 rounded-full text-xs text-gray-600">
                  +{recipients.length - 3}
                </span>
              )}
              <input
                type="text"
                value={recipientInput}
                onChange={(e) => setRecipientInput(e.target.value)}
                onKeyDown={handleRecipientKeyDown}
                onBlur={() => recipientInput && addRecipient(recipientInput)}
                placeholder={recipients.length === 0 ? 'recipient@example.com' : ''}
                className="flex-1 min-w-[200px] text-sm outline-none py-1.5 placeholder-gray-400"
              />
            </div>
            <div className="flex items-center gap-1">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept=".csv,.txt"
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 text-emerald-600 hover:text-emerald-700 text-sm font-medium whitespace-nowrap"
              >
                <Upload size={14} />
                Upload List
              </button>
            </div>
          </div>

          <div className="border-b border-gray-100 mb-4" />

          {/* Subject */}
          <div className="flex items-center gap-4 mb-4">
            <label className="text-sm text-gray-500 w-16">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              className="flex-1 text-sm outline-none py-1.5 placeholder-gray-400"
            />
          </div>

          <div className="border-b border-gray-100 mb-4" />

          {/* Delay & Hourly Limit */}
          <div className="flex items-center gap-6 mb-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Delay between 2 emails</span>
              <input
                type="text"
                value={delayBetween}
                onChange={(e) => setDelayBetween(e.target.value.replace(/\D/g, ''))}
                className="w-12 text-center border border-gray-200 rounded-md py-1.5 text-sm outline-none focus:border-emerald-400"
                placeholder="00"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Hourly Limit</span>
              <input
                type="text"
                value={hourlyLimit}
                onChange={(e) => setHourlyLimit(e.target.value.replace(/\D/g, ''))}
                className="w-12 text-center border border-gray-200 rounded-md py-1.5 text-sm outline-none focus:border-emerald-400"
                placeholder="00"
              />
            </div>
          </div>

          <div className="border-b border-gray-100 mb-4" />

          {/* Body editor */}
          <div className="flex-1 flex flex-col">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Type Your Reply..."
              className="flex-1 min-h-[200px] text-sm outline-none resize-none placeholder-gray-400 leading-relaxed"
            />

            {/* Simple toolbar (decorative to match Figma) */}
            <div className="flex items-center gap-1 py-3 border-t border-gray-100 mt-auto">
              {['↩', '↪', 'Tt', 'B', 'I', 'U', '≡', '⇕', '▤', '⊞', '≫', '≪', '❝', '⎘', '⚡'].map(
                (icon, i) => (
                  <button
                    key={i}
                    className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded text-xs transition-colors"
                  >
                    {icon}
                  </button>
                )
              )}
            </div>
          </div>
        </div>

        {/* Schedule picker sidebar */}
        {showSchedulePicker && (
          <div className="w-72 border-l border-gray-100 p-5 bg-white">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Send Later</h3>

            {/* Date/Time picker */}
            <div className="mb-4">
              <label className="block text-xs text-gray-500 mb-1.5">Pick date & time</label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="flex-1 border border-gray-200 rounded-md px-2 py-1.5 text-sm outline-none focus:border-emerald-400"
                />
                <input
                  type="time"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  className="w-24 border border-gray-200 rounded-md px-2 py-1.5 text-sm outline-none focus:border-emerald-400"
                />
              </div>
            </div>

            {/* Quick presets */}
            <div className="space-y-1">
              {[
                { label: 'Tomorrow', preset: 'tomorrow-10' },
                { label: 'Tomorrow, 10:00 AM', preset: 'tomorrow-10' },
                { label: 'Tomorrow, 11:00 AM', preset: 'tomorrow-11' },
                { label: 'Tomorrow, 3:00 PM', preset: 'tomorrow-15' },
              ].map((item) => (
                <button
                  key={item.label}
                  onClick={() => {
                    const { date, time } = getQuickTime(item.preset);
                    setScheduleDate(date);
                    setScheduleTime(time);
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-md transition-colors"
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
              <button
                onClick={() => setShowSchedulePicker(false)}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
              <Button variant="outline" size="sm" onClick={handleSchedule} loading={isSubmitting}>
                Done
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
