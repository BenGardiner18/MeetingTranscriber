"use client";

import { useState } from 'react';
import { Button } from './ui/button';
import { supabase } from '@/lib/supabase';

export function ZoomConnect() {
  const [isConnecting, setIsConnecting] = useState(false);

  const connectZoom = async () => {
    try {
      setIsConnecting(true);
      
      // Get the current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Generate a state parameter for security
      const state = crypto.randomUUID();
      
      // Store the state in Supabase for verification
      await supabase
        .from('zoom_auth_states')
        .insert({ user_id: user.id, state });
      
      // Redirect to Zoom OAuth
      const zoomAuthUrl = new URL('https://zoom.us/oauth/authorize');
      zoomAuthUrl.searchParams.append('response_type', 'code');
      zoomAuthUrl.searchParams.append('client_id', process.env.NEXT_PUBLIC_ZOOM_CLIENT_ID!);
      zoomAuthUrl.searchParams.append('redirect_uri', `${window.location.origin}/api/zoom/callback`);
      zoomAuthUrl.searchParams.append('state', state);
      
      window.location.href = zoomAuthUrl.toString();
    } catch (error) {
      console.error('Error connecting to Zoom:', error);
      alert('Failed to connect to Zoom. Please try again.');
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 p-6 bg-card rounded-lg shadow-sm">
      <h2 className="text-2xl font-bold">Connect Your Zoom Account</h2>
      <p className="text-muted-foreground text-center">
        Link your Zoom account to automatically transcribe and store your meetings.
      </p>
      <Button 
        onClick={connectZoom} 
        disabled={isConnecting}
        className="w-full max-w-xs"
      >
        {isConnecting ? 'Connecting...' : 'Connect Zoom'}
      </Button>
    </div>
  );
} 