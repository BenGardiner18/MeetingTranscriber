"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ZoomConnect } from '@/components/ZoomConnect';
import { Button } from '@/components/ui/button';

type Meeting = {
  id: string;
  meeting_id: string;
  topic: string;
  recording_url: string;
  status: 'pending_transcription' | 'transcribing' | 'completed' | 'failed';
  created_at: string;
};

export default function DashboardPage() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasZoomConnection, setHasZoomConnection] = useState(false);

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      // Get the current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        // window.location.href = '/auth/login';
        return;
      }

      // Check if user has connected Zoom
      const { data: connection } = await supabase
        .from('zoom_connections')
        .select('id')
        .eq('user_id', user.id)
        .single();

      setHasZoomConnection(!!connection);

      // Load user's meetings
      const { data: meetingsData } = await supabase
        .from('meetings')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (meetingsData) {
        setMeetings(meetingsData);
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getVideoUrl = async (recordingUrl: string) => {
    try {
      const { data } = await supabase.storage
        .from('meetings')
        .createSignedUrl(recordingUrl, 3600); // 1 hour expiry

      if (data?.signedUrl) {
        return data.signedUrl;
      }
      return null;
    } catch (error) {
      console.error('Error getting video URL:', error);
      return null;
    }
  };

  if (isLoading) {
    return <div className="flex justify-center items-center min-h-screen">Loading...</div>;
  }

  if (!hasZoomConnection) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8">Welcome to MeetingTranscriber</h1>
        <ZoomConnect />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Your Meetings</h1>
      
      {meetings.length === 0 ? (
        <div className="text-center py-12 bg-muted rounded-lg">
          <p className="text-lg text-muted-foreground">
            No meetings found. Your recordings will appear here once they&apos;re processed.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {meetings.map((meeting) => (
            <div key={meeting.id} className="bg-card rounded-lg shadow-sm p-6">
              <h2 className="text-xl font-semibold mb-2">{meeting.topic}</h2>
              <p className="text-sm text-muted-foreground mb-4">
                {new Date(meeting.created_at).toLocaleDateString()}
              </p>
              <div className="flex items-center gap-2 mb-4">
                <div className={`w-2 h-2 rounded-full ${
                  meeting.status === 'completed' ? 'bg-green-500' :
                  meeting.status === 'failed' ? 'bg-red-500' :
                  meeting.status === 'transcribing' ? 'bg-yellow-500' :
                  'bg-gray-500'
                }`} />
                <span className="text-sm capitalize">{meeting.status.replace('_', ' ')}</span>
              </div>
              {meeting.status === 'completed' && (
                <Button
                  onClick={async () => {
                    const url = await getVideoUrl(meeting.recording_url);
                    if (url) {
                      window.open(url, '_blank');
                    }
                  }}
                  className="w-full"
                >
                  View Recording
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
