import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);

// Initialize database tables
export const initializeDatabase = async () => {
  try {
    // Car parks table
    await supabase.rpc('init_car_parks').catch(() => {
      // Table might already exist
    });

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
