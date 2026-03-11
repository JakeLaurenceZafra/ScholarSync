'use client';

import { useState, useEffect } from 'react';

interface CalendarEvent {
  id: string;
  summary: string;
}

export default function GoogleCalendarWidget() {
  const [currentDate, setCurrentDate] = useState<string>('');
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Format the current date
    const dateOptions: Intl.DateTimeFormatOptions = { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    };
    setCurrentDate(new Date().toLocaleDateString('en-US', dateOptions));

    // Fetch Public Holidays for the current date using Google Calendar API
    const fetchEvents = async () => {
      setLoading(true);
      try {
        const apiKey = process.env.NEXT_PUBLIC_GOOGLE_CALENDAR_API_KEY;
        if (!apiKey) {
          console.error("Google Calendar API Key is missing");
          setLoading(false);
          return;
        }

        // Philippine Public Holidays Calendar ID
        const calendarId = 'en.ph#holiday@group.v.calendar.google.com';
        
        // Get start and end of today to only fetch today's events
        const today = new Date();
        const startOfDay = new Date(today.setHours(0, 0, 0, 0)).toISOString();
        const endOfDay = new Date(today.setHours(23, 59, 59, 999)).toISOString();

        const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?key=${apiKey}&timeMin=${startOfDay}&timeMax=${endOfDay}&singleEvents=true&orderBy=startTime`;
        
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          setEvents(data.items || []);
        } else {
          console.error('Failed to fetch calendar events', await response.text());
        }
      } catch (error) {
        console.error('Error fetching calendar:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, []);

  return (
    <div className="bg-white/90 backdrop-blur shadow-md rounded-xl p-4 border border-blue-100 flex flex-col items-center justify-center min-w-[200px]">
      <div className="flex items-center gap-2 text-indigo-600 mb-1">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5m-9-6h.008v.008H12v-.008ZM12 15h.008v.008H12V15Zm0 2.25h.008v.008H12v-.008ZM9.75 15h.008v.008H9.75V15Zm0 2.25h.008v.008H9.75v-.008ZM7.5 15h.008v.008H7.5V15Zm0 2.25h.008v.008H7.5v-.008Zm6.75-4.5h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V15Zm0 2.25h.008v.008h-.008v-.008Zm2.25-4.5h.008v.008H16.5v-.008Zm0 2.25h.008v.008H16.5V15Z" />
        </svg>
        <span className="font-semibold text-sm uppercase tracking-wider">{currentDate}</span>
      </div>
      
      <div className="text-gray-500 text-xs mt-1 text-center font-medium">
        {loading ? (
          <span className="animate-pulse">Loading events...</span>
        ) : events.length > 0 ? (
          <div className="flex flex-col gap-1">
            {events.map(event => (
              <span key={event.id} className="text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded text-[10px] w-full max-w-[180px] truncate" title={event.summary}>
                ★ {event.summary}
              </span>
            ))}
          </div>
        ) : (
          <span>No public holidays today</span>
        )}
      </div>
    </div>
  );
}
