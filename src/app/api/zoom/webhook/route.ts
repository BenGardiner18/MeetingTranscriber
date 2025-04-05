import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    
    // Verify this is a recording completed event
    if (payload.event !== 'recording.completed') {
      return NextResponse.json({ success: true });
    }

    const { object } = payload.payload;
    const { id: meetingId, host_id: hostId, topic } = object;

    // Find the user associated with this Zoom account
    const { data: webhook } = await supabase
      .from('zoom_webhooks')
      .select('user_id')
      .eq('account_id', hostId)
      .single();

    if (!webhook) {
      console.error('No webhook found for host:', hostId);
      return NextResponse.json({ success: true });
    }

    // Get the user's Zoom access token
    const { data: connection } = await supabase
      .from('zoom_connections')
      .select('access_token')
      .eq('user_id', webhook.user_id)
      .single();

    if (!connection) {
      console.error('No Zoom connection found for user:', webhook.user_id);
      return NextResponse.json({ success: true });
    }

    // Get the recording files
    const recordingsResponse = await fetch(
      `https://api.zoom.us/v2/meetings/${meetingId}/recordings`,
      {
        headers: {
          'Authorization': `Bearer ${connection.access_token}`,
        },
      }
    );

    if (!recordingsResponse.ok) {
      throw new Error('Failed to get recording files');
    }

    const recordingsData = await recordingsResponse.json();
    const recordingFiles = recordingsData.recording_files;

    // Process each recording file
    for (const file of recordingFiles) {
      if (file.recording_type === 'MP4') {
        // Download the recording
        const fileResponse = await fetch(file.download_url, {
          headers: {
            'Authorization': `Bearer ${connection.access_token}`,
          },
        });

        if (!fileResponse.ok) {
          throw new Error('Failed to download recording');
        }

        const videoBuffer = await fileResponse.arrayBuffer();
        const filePath = `users/${webhook.user_id}/meetings/${meetingId}/recording.mp4`;

        // Upload to Supabase Storage
        const { error: uploadError } = await supabase.storage
          .from('meetings')
          .upload(filePath, videoBuffer, {
            contentType: 'video/mp4',
            upsert: true
          });

        if (uploadError) {
          throw new Error('Failed to upload to Supabase Storage');
        }

        // Store meeting metadata in Supabase
        await supabase
          .from('meetings')
          .insert({
            user_id: webhook.user_id,
            meeting_id: meetingId,
            topic,
            recording_url: filePath,
            status: 'pending_transcription',
          });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error processing Zoom webhook:', error);
    return NextResponse.json(
      { error: 'Failed to process webhook' },
      { status: 500 }
    );
  }
} 