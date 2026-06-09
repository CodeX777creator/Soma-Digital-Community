import * as admin from 'firebase-admin';

const db = admin.firestore();

export async function createNotification(
  userId: string,
  type: string,
  title: string,
  body: string,
  linkUrl = '/dashboard'
) {
  if (!userId) {
    throw new Error('Missing userId for notification');
  }

  await db.collection('users').doc(userId).collection('notifications').add({
    type,
    title,
    body,
    linkUrl,
    readAt: null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}
