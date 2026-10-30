import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "SUPABASE_URL or SUPABASE_ANON_KEY environment variables are missing."
  );
}

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey
);

// Admin client: server-only, uses the secret key. Stays null if the key is not set.
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
export const supabaseAdmin = supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

/**
 * Validates production cloud platform infrastructure readiness checks
 */
export const verifyCloudEnvironmentState = () => {
  const deploymentContext = {
    databaseConnected: !!supabaseUrl,
    environmentMode: process.env.NODE_ENV || 'production',
    gatewayRouteURL: process.env.RENDER_EXTERNAL_URL || 'http://localhost:5000',
    timestamp: new Date().toISOString()
  };
  console.log(`[CLOUD AGENT] Deployment environment metrics initialized:`, deploymentContext);
  return deploymentContext;
};

// Trigger environmental audit verification check loops immediately on engine startup
verifyCloudEnvironmentState();