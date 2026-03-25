import './App.css';
import { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';

// Generate time slots for 8 AM to 6 PM in 4 slots of 2.5 hours each
const generateTimeSlots = () => {
  const slots = [
    '08:00-10:30',
    '10:30-13:00',
    '13:00-15:30',
    '15:30-18:00'
  ];
  return slots;
};

const TIME_SLOTS = generateTimeSlots();

// Generate dates for next 7 days
const generateNext7Days = () => {
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date();
    date.setDate(date.getDate() + i);
    dates.push(date.toISOString().split('T')[0]); // YYYY-MM-DD format
  }
  return dates;
};

const NEXT_7_DAYS = generateNext7Days();

// Format date for display
const formatDate = (dateString) => {
  const date = new Date(dateString + 'T00:00:00');
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dayName = days[date.getDay()];
  const monthName = months[date.getMonth()];
  const dayNum = date.getDate();
  return `${dayName} ${dayNum} ${monthName}`;
};

// Initialize charging spaces with booking slots for all 7 days
const initializeChargingSpaces = (count) => {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    bookings: NEXT_7_DAYS.reduce((dateAcc, date) => ({
      ...dateAcc,
      [date]: TIME_SLOTS.reduce((slotAcc, slot) => ({
        ...slotAcc,
        [slot]: null // null = available, object = booked with details
      }), {})
    }), {})
  }));
};

function App() {
  const [carParks, setCarParks] = useState([]);
  const [chargingSpaces, setChargingSpaces] = useState([]);
  const [chargingBookings, setChargingBookings] = useState([]);
  const [parkingSessions, setParkingSessions] = useState([]);
  const [activeTab, setActiveTab] = useState('parking');
  const [selectedDate, setSelectedDate] = useState(NEXT_7_DAYS[0]);
  const [showLandingPage, setShowLandingPage] = useState(true);
  const [suggestedPark, setSuggestedPark] = useState(null);
  const [loading, setLoading] = useState(true);
  const [bookingForm, setBookingForm] = useState({
    isOpen: false,
    parkId: null,
    spaceId: null,
    date: null,
    timeSlot: null,
    name: '',
    carReg: ''
  });

  // Load car parks and subscriptions
  useEffect(() => {
    const loadData = async () => {
      try {
        // Fetch car parks
        const { data: parks, error: parksError } = await supabase
          .from('car_parks')
          .select('*');
        
        if (parksError) throw parksError;
        setCarParks(parks || []);

        // Fetch parking sessions
        const { data: sessions, error: sessionsError } = await supabase
          .from('parking_sessions')
          .select('*')
          .is('check_out_time', null); // Only active sessions
        
        if (sessionsError) throw sessionsError;
        setParkingSessions(sessions || []);

        // Fetch charging bookings
        const { data: bookings, error: bookingsError } = await supabase
          .from('charging_bookings')
          .select('*');
        
        if (bookingsError) throw bookingsError;
        setChargingBookings(bookings || []);

        // Fetch charging spaces
        const { data: spaces, error: spacesError } = await supabase
          .from('charging_spaces')
          .select('*');
        
        if (spacesError) throw spacesError;
        setChargingSpaces(spaces || []);

        setLoading(false);

        // Subscribe to real-time updates
        const carParksSub = supabase
          .from('car_parks')
          .on('*', payload => {
            if (payload.eventType === 'UPDATE') {
              setCarParks(parks => parks.map(p => p.id === payload.new.id ? payload.new : p));
            }
          })
          .subscribe();

        const sessionsSub = supabase
          .from('parking_sessions')
          .on('*', payload => {
            if (payload.eventType === 'INSERT') {
              setParkingSessions(s => [...s, payload.new]);
            } else if (payload.eventType === 'UPDATE') {
              setParkingSessions(s => s.map(x => x.id === payload.new.id ? payload.new : x));
            }
          })
          .subscribe();

        const bookingsSub = supabase
          .from('charging_bookings')
          .on('*', payload => {
            if (payload.eventType === 'INSERT') {
              setChargingBookings(b => [...b, payload.new]);
            } else if (payload.eventType === 'DELETE') {
              setChargingBookings(b => b.filter(x => x.id !== payload.old.id));
            }
          })
          .subscribe();

        return () => {
          supabase.removeSubscription(carParksSub);
          supabase.removeSubscription(sessionsSub);
          supabase.removeSubscription(bookingsSub);
        };
      } catch (error) {
        console.error('Error loading data:', error);
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // Find the best car park based on availability
  const getBestCarPark = () => {
    if (carParks.length === 0) return null;
    let bestPark = carParks[0];
    let maxAvailable = carParks[0].available_spaces;
    
    carParks.forEach(park => {
      if (park.available_spaces > maxAvailable) {
        maxAvailable = park.available_spaces;
        bestPark = park;
      }
    });
    
    return bestPark;
  };

  const handleParkingClick = () => {
    const best = getBestCarPark();
    setSuggestedPark(best);
    setShowLandingPage(false);
    setActiveTab('parking');
  };

  const handleEVClick = () => {
    setShowLandingPage(false);
    setActiveTab('charging');
  };

  const goBackToLanding = () => {
    setShowLandingPage(true);
    setSuggestedPark(null);
  };

  const registerEntry = async (parkId) => {
    const park = carParks.find(p => p.id === parkId);
    if (!park || park.available_spaces <= 0) {
      alert('No spaces available');
      return;
    }

    const { error: parkError } = await supabase
      .from('car_parks')
      .update({ available_spaces: park.available_spaces - 1, updated_at: new Date() })
      .eq('id', parkId);

    if (parkError) {
      alert('Error registering entry: ' + parkError.message);
      return;
    }

    const { error: sessionError } = await supabase
      .from('parking_sessions')
      .insert([{
        car_park_id: parkId,
        user_name: 'User ' + Math.random().toString(36).substring(7),
        car_reg: 'REG' + Math.random().toString(36).substring(7).toUpperCase()
      }]);

    if (sessionError) {
      alert('Error creating session: ' + sessionError.message);
    }
  };

  const registerExit = async (parkId) => {
    const park = carParks.find(p => p.id === parkId);
    if (!park || park.available_spaces >= park.total_spaces) {
      alert('No active sessions');
      return;
    }

    const { error } = await supabase
      .from('car_parks')
      .update({ available_spaces: park.available_spaces + 1, updated_at: new Date() })
      .eq('id', parkId);

    if (error) {
      alert('Error registering exit: ' + error.message);
    }
  };

  const toggleChargingBooking = (parkId, spaceId, date, timeSlot) => {
    const booking = chargingBookings.find(
      b => b.charging_space_id === spaceId && b.booking_date === date && b.time_slot === timeSlot
    );

    if (booking) {
      cancelBooking(booking.id);
    } else {
      setBookingForm({
        isOpen: true,
        parkId,
        spaceId,
        date,
        timeSlot,
        name: '',
        carReg: ''
      });
    }
  };

  const submitBooking = async () => {
    const { spaceId, date, timeSlot, name, carReg } = bookingForm;

    if (!name.trim() || !carReg.trim()) {
      alert('Please enter both name and car registration');
      return;
    }

    const { error } = await supabase
      .from('charging_bookings')
      .insert([{
        charging_space_id: spaceId,
        booking_date: date,
        time_slot: timeSlot,
        user_name: name.trim(),
        car_reg: carReg.trim()
      }]);

    if (error) {
      alert('Error creating booking: ' + error.message);
      return;
    }

    closeBookingForm();
  };

  const cancelBooking = async (bookingId) => {
    const { error } = await supabase
      .from('charging_bookings')
      .delete()
      .eq('id', bookingId);

    if (error) {
      alert('Error cancelling booking: ' + error.message);
    }
  };

  const closeBookingForm = () => {
    setBookingForm({
      isOpen: false,
      parkId: null,
      spaceId: null,
      date: null,
      timeSlot: null,
      name: '',
      carReg: ''
    });
  };

  if (loading) {
    return (
      <div className="App">
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="App">
      {/* Landing Page */}
      {showLandingPage ? (
        <div className="landing-page">
          <div className="landing-content">
            <h1 className="landing-title">🅿️ Card Factory Parking Assistant</h1>
            <p className="landing-subtitle">Where would you like to go today?</p>
            
            <div className="landing-options">
              <button className="landing-option parking-option" onClick={handleParkingClick}>
                <div className="option-icon">🚗</div>
                <div className="option-title">I Want to Park</div>
                <div className="option-description">Find and manage parking spaces</div>
              </button>
              
              <button className="landing-option ev-option" onClick={handleEVClick}>
                <div className="option-icon">⚡</div>
                <div className="option-title">I Want to Charge</div>
                <div className="option-description">Book an EV charging space</div>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Main App */}
          <header className="App-header">
            <div className="app-header-top">
              <h1>🅿️ Card Factory Parking Assistant</h1>
              <button className="btn-back" onClick={goBackToLanding}>← Back to Home</button>
            </div>
            
            {/* Suggestion Banner */}
            {suggestedPark && activeTab === 'parking' && (
              <div className="suggestion-banner">
                <span className="suggestion-icon">✨</span>
                <span className="suggestion-text">
                  We recommend <strong>{suggestedPark.name}</strong> - it has the most available spaces ({suggestedPark.availableSpaces}/{suggestedPark.totalSpaces})
                </span>
              </div>
            )}
            
            {/* Tab Navigation */}
            <div className="tab-navigation">
              <button
                className={`tab-button ${activeTab === 'parking' ? 'active' : ''}`}
            onClick={() => setActiveTab('parking')}
          >
            🅿️ Parking Spaces
          </button>
          <button
            className={`tab-button ${activeTab === 'charging' ? 'active' : ''}`}
            onClick={() => setActiveTab('charging')}
          >
            🔌 EV Charging
          </button>
        </div>

        {/* Parking Tab */}
        {activeTab === 'parking' && (
          <div className="tab-content">
            <p className="subtitle">Track and manage available parking spaces</p>
            <div className="parks-container">
              {carParks.map(park => {
                const occupancyPercentage = ((park.total_spaces - park.available_spaces) / park.total_spaces) * 100;
                const isFull = park.available_spaces === 0;
                
                return (
                  <div key={park.id} className={`park-card ${isFull ? 'full' : ''}`}>
                    <h2>{park.name}</h2>
                    <div className="space-info">
                      <div className="available">
                        <span className="number">{park.available_spaces}</span>
                        <span className="label">Available Spaces</span>
                      </div>
                      <div className="divider">of</div>
                      <div className="total">
                        <span className="number">{park.total_spaces}</span>
                        <span className="label">Total Spaces</span>
                      </div>
                    </div>
                    
                    <div className="progress-bar">
                      <div 
                        className="progress-fill" 
                        style={{ width: `${occupancyPercentage}%` }}
                      />
                    </div>
                    <p className="occupancy-text">{occupancyPercentage.toFixed(0)}% Occupied</p>
                    
                    <div className="button-group">
                      <button 
                        className="btn-register"
                        onClick={() => registerEntry(park.id)}
                        disabled={isFull}
                      >
                        {isFull ? '🚫 FULL' : '➕ Entry'}
                      </button>
                      <button 
                        className="btn-exit"
                        onClick={() => registerExit(park.id)}
                        disabled={park.available_spaces === park.total_spaces}
                      >
                        {park.available_spaces === park.total_spaces ? '✓ EMPTY' : '➖ Exit'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* EV Charging Tab */}
        {activeTab === 'charging' && (
          <div className="tab-content">
            <p className="subtitle">Book electric vehicle charging spaces</p>
            
            {/* Date Calendar */}
            <div className="date-calendar">
              <h3>Select Date:</h3>
              <div className="date-buttons">
                {NEXT_7_DAYS.map(date => (
                  <button
                    key={date}
                    className={`date-button ${selectedDate === date ? 'active' : ''}`}
                    onClick={() => setSelectedDate(date)}
                  >
                    <div className="date-day">{formatDate(date).split(' ')[0]}</div>
                    <div className="date-num">{formatDate(date).split(' ')[1]}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="charging-container">
              {carParks.map(park => {
                const parkChargingSpaces = chargingSpaces.filter(s => s.car_park_id === park.id);
                return (
                  <div key={park.id} className="charging-park">
                    <div className="charging-park-header">
                      <h2>{park.name}</h2>
                      <span className="charging-count">({parkChargingSpaces.length} spaces)</span>
                    </div>

                    <div className="charging-spaces">
                      {parkChargingSpaces.map(space => (
                        <div key={space.id} className="charging-space">
                          <h4>Space {space.space_number}</h4>
                          <div className="time-slots">
                            {TIME_SLOTS.map(slot => {
                              const booking = chargingBookings.find(
                                b => b.charging_space_id === space.id && 
                                     b.booking_date === selectedDate && 
                                     b.time_slot === slot
                              );
                              return (
                                <div
                                  key={slot}
                                  className={`time-slot ${booking ? 'booked' : 'available'}`}
                                  onClick={() => toggleChargingBooking(park.id, space.id, selectedDate, slot)}
                                >
                                  {booking ? (
                                    <div className="booking-details">
                                      <div className="booking-time">{slot}</div>
                                      <div className="booking-info">
                                        <div className="booking-name">{booking.user_name}</div>
                                        <div className="booking-reg">{booking.car_reg}</div>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="available-slot">
                                      <span className="slot-time">{slot}</span>
                                      <span className="slot-status">○</span>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </header>

      {/* Booking Form Modal */}
      {bookingForm.isOpen && (
        <div className="modal-overlay" onClick={closeBookingForm}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>📝 Book Charging Slot</h2>
            <div className="booking-form-details">
              <p><strong>Date:</strong> {formatDate(bookingForm.date)}</p>
              <p><strong>Time Slot:</strong> {bookingForm.timeSlot}</p>
            </div>
            
            <div className="form-group">
              <label htmlFor="name">Driver Name:</label>
              <input
                id="name"
                type="text"
                placeholder="Enter your name"
                value={bookingForm.name}
                onChange={(e) => setBookingForm({ ...bookingForm, name: e.target.value })}
                onKeyPress={(e) => e.key === 'Enter' && submitBooking()}
              />
            </div>

            <div className="form-group">
              <label htmlFor="carReg">Car Registration:</label>
              <input
                id="carReg"
                type="text"
                placeholder="e.g., ABC123XY"
                value={bookingForm.carReg}
                onChange={(e) => setBookingForm({ ...bookingForm, carReg: e.target.value })}
                onKeyPress={(e) => e.key === 'Enter' && submitBooking()}
              />
            </div>

            <div className="form-buttons">
              <button className="btn-submit" onClick={submitBooking}>
                ✓ Confirm Booking
              </button>
              <button className="btn-cancel" onClick={closeBookingForm}>
                ✗ Cancel
              </button>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}

export default App;
