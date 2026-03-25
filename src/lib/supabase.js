import { createClient } from '@supabase/supabase-js';

// Supabase configuration - using hardcoded values since the public key is meant to be public
const supabaseUrl = 'https://vrguaowdhgmxzrgvepkb.supabase.co';
const supabaseKey = 'sb_publishable_Jf8bP4EzChTvIpXqvmKm-Q_x3gT5Trg';

export const supabase = createClient(supabaseUrl, supabaseKey);

// Initialize database tables
export const initializeDatabase = async () => {
  try {
    // Check if tables exist by querying them
    const { data: carParks } = await supabase.from('car_parks').select('id').limit(1);
    
    if (carParks !== null) {
      return true; // Tables already initialized
    }
  } catch (error) {
    console.log('Tables will be created on first sync');
  }
  return false;
};
