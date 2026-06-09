import * as admin from 'firebase-admin';

/**
 * Firebase Admin SDK Configuration
 * 
 * Required environment variables:
 * - FIREBASE_PROJECT_ID (or NEXT_PUBLIC_FIREBASE_PROJECT_ID as fallback)
 * - GOOGLE_APPLICATION_CREDENTIALS (path to service account JSON file)
 *   OR
 * - GOOGLE_APPLICATION_CREDENTIALS_JSON (JSON content of service account)
 * 
 * The Admin SDK will fail fast if credentials are not properly configured.
 */

interface FirebaseAdminConfig {
  projectId: string;
  credential: admin.ServiceAccount;
  storageBucket?: string;
}

function validateAdminConfig(): FirebaseAdminConfig {
  // Validate project ID
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  
  if (!projectId || projectId.trim() === '') {
    throw new Error(
      '[Firebase Admin] Missing required environment variable: FIREBASE_PROJECT_ID or NEXT_PUBLIC_FIREBASE_PROJECT_ID\n' +
      'Please set your Firebase project ID in your environment variables.'
    );
  }

  // Validate that GOOGLE_APPLICATION_CREDENTIALS is set
  // This is required for applicationDefault() to work
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;

  if (!credentialsPath && !credentialsJson) {
    throw new Error(
      '[Firebase Admin] Missing Firebase Admin credentials.\n' +
      'Please set ONE of the following environment variables:\n' +
      '1. GOOGLE_APPLICATION_CREDENTIALS - Path to service account JSON file\n' +
      '2. GOOGLE_APPLICATION_CREDENTIALS_JSON - Service account JSON content\n' +
      '\nTo generate a service account key:\n' +
      '1. Go to Firebase Console > Project Settings > Service Accounts\n' +
      '2. Click "Generate new private key"\n' +
      '3. Store the JSON securely and reference it via environment variable'
    );
  }

  // If using JSON content directly, parse and validate it
  let credential: admin.ServiceAccount;
  
  if (credentialsJson) {
    try {
      const serviceAccount = JSON.parse(credentialsJson);
      
      // Validate required service account fields
      if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
        throw new Error('Service account JSON is missing required fields: project_id, client_email, or private_key');
      }
      
      credential = serviceAccount as admin.ServiceAccount;
    } catch (parseError: any) {
      throw new Error(
        `[Firebase Admin] Failed to parse GOOGLE_APPLICATION_CREDENTIALS_JSON: ${parseError.message}\n` +
        'Ensure the JSON is valid and properly escaped for environment variable storage.'
      );
    }
  } else {
    // applicationDefault() will use GOOGLE_APPLICATION_CREDENTIALS path
    // We can't validate the file exists here, but Firebase will throw on init if invalid
    credential = admin.credential.applicationDefault() as unknown as admin.ServiceAccount;
  }

  return {
    projectId: projectId.trim(),
    credential,
    storageBucket: `${projectId.trim()}.appspot.com`,
  };
}

// Initialize Firebase Admin SDK with strict validation
let adminApp: admin.app.App;

try {
  if (!admin.apps.length) {
    const config = validateAdminConfig();
    
    // Use cert() for explicit credential, or applicationDefault() for env var path
    const credential = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON 
      ? admin.credential.cert(config.credential)
      : admin.credential.applicationDefault();
    
    admin.initializeApp({
      projectId: config.projectId,
      credential,
      storageBucket: config.storageBucket,
    });
  }
  
  adminApp = admin.app();
} catch (error: any) {
  // Fail fast with clear error message
  const errorMessage = error.message || 'Unknown error';
  
  // Log to stderr for server-side visibility (safe, no secrets)
  // eslint-disable-next-line no-console
  console.error('[Firebase Admin] CRITICAL: Initialization failed:', errorMessage);
  
  throw new Error(`[Firebase Admin] Initialization failed: ${errorMessage}`);
}

// Export initialized services
// These will throw if accessed before successful initialization
export const adminDb: admin.firestore.Firestore = adminApp.firestore();
export const adminAuth: admin.auth.Auth = adminApp.auth();
export const adminStorage: admin.storage.Storage = adminApp.storage();

// Re-export admin for advanced use cases
export { admin };
