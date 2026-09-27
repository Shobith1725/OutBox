'use client';

import { getGoogleLoginUrl } from '@/lib/api';

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Top dark header bar */}
      <div className="h-8 bg-gray-900 w-full flex items-center px-4">
        <span className="text-gray-400 text-xs">Login Screen</span>
      </div>

      {/* Login card */}
      <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-md border border-gray-200 rounded-lg p-10">
          <h1 className="text-2xl font-bold text-center mb-8">Login</h1>

          {/* Google Login */}
          <a
            href={getGoogleLoginUrl()}
            className="w-full flex items-center justify-center gap-3 bg-green-50 border border-green-200 rounded-md py-3 px-4 text-sm font-medium text-gray-700 hover:bg-green-100 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Login with Google
          </a>

          {/* Divider */}
          <div className="flex items-center gap-4 my-6">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400">or sign up through email</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* Email/Password fields (decorative — only Google OAuth is functional) */}
          <div className="space-y-4">
            <input
              type="email"
              placeholder="Email ID"
              className="w-full border border-gray-200 rounded-md py-3 px-4 text-sm text-gray-500 bg-gray-50 outline-none cursor-not-allowed"
              disabled
              title="Only Google OAuth is supported"
            />
            <input
              type="password"
              placeholder="Password"
              className="w-full border border-gray-200 rounded-md py-3 px-4 text-sm text-gray-500 bg-gray-50 outline-none cursor-not-allowed"
              disabled
              title="Only Google OAuth is supported"
            />
            <button
              disabled
              className="w-full bg-emerald-500 text-white rounded-md py-3 text-sm font-medium cursor-not-allowed opacity-70"
            >
              Login
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
