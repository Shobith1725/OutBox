// Shared types — mirrored from backend/src/types/index.ts

export interface UserResponse {
  id: string;
  email: string;
  name: string;
  avatar: string | null;
}

export interface SenderResponse {
  id: string;
  displayName: string;
  fromEmail: string;
}

export interface ScheduleEmailRequest {
  subject: string;
  body: string;
  senderId: string;
  recipients: string[];
  startTime: string;
  delayBetweenEmailsMs: number;
  maxEmailsPerHour: number;
}

export interface ScheduleEmailResponse {
  campaignId: string;
  jobsCreated: number;
  startTime: string;
}

export interface ScheduledEmailResponse {
  id: string;
  recipientEmail: string;
  subject: string;
  body: string;
  scheduledAt: string;
  status: 'pending' | 'processing' | 'sent' | 'failed';
  sentAt: string | null;
  error: string | null;
  previewUrl: string | null;
  senderEmail: string;
  senderName: string;
  campaignId: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface CsvUploadResponse {
  emails: string[];
  count: number;
}

export interface SlackStatusResponse {
  connected: boolean;
  teamName?: string;
  channelName?: string;
}
