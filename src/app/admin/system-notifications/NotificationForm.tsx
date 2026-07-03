'use client';

import { useState } from 'react';
import { createSystemNotification } from '@/app/actions/systemNotifications';

export default function NotificationForm() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ success?: boolean; message?: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setStatus(null);

    const formData = new FormData(e.currentTarget);
    const result = await createSystemNotification({
      title: formData.get('title') as string,
      body: formData.get('body') as string,
      linkUrl: formData.get('linkUrl') as string,
    });

    setStatus(result);
    setLoading(false);
    if (result.success) {
      e.currentTarget.reset();
    }
  };

  return (
    <div className="max-w-md mx-auto bg-white p-6 rounded-lg shadow-md border border-gray-200">
      <h2 className="text-xl font-bold mb-4 text-gray-800">Send System Notification (e.g., ToS Update)</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-700">Title</label>
          <input
            type="text"
            id="title"
            name="title"
            required
            placeholder="e.g., ToS Update"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
          />
        </div>

        <div>
          <label htmlFor="body" className="block text-sm font-medium text-gray-700">Message Body</label>
          <textarea
            id="body"
            name="body"
            required
            rows={3}
            placeholder="e.g., Please review the new Terms of Service."
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
          />
        </div>

        <div>
          <label htmlFor="linkUrl" className="block text-sm font-medium text-gray-700">Link URL (Optional)</label>
          <input
            type="text"
            id="linkUrl"
            name="linkUrl"
            placeholder="/settings/legal"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
          />
        </div>

        {status && (
          <div className={`p-3 rounded-md ${status.success ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {status.message}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {loading ? 'Sending...' : 'Send Broadcast'}
        </button>
      </form>
    </div>
  );
}