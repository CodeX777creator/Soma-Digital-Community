import NotificationForm from './NotificationForm';

export default function AdminSystemNotificationsPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6 text-gray-900">Admin: System Notifications</h1>
      <p className="mb-6 text-gray-600">
        Use this form to broadcast urgent notifications to all users, such as Terms of Service updates or maintenance alerts.
      </p>
      <NotificationForm />
    </div>
  );
}