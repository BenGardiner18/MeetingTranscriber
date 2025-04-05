import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    
    if (!code || !state) {
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/dashboard?error=missing_params`);
    }

    // Verify the state parameter
    const { data: authState } = await supabase
      .from('zoom_auth_states')
      .select('user_id')
      .eq('state', state)
      .single();

    if (!authState) {
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/dashboard?error=invalid_state`);
    }

    // Exchange the code for access tokens
    const tokenResponse = await fetch('https://zoom.us/oauth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/zoom/callback`,
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error('Failed to get Zoom tokens');
    }

    const tokens = await tokenResponse.json();

    // Store the tokens in Supabase
    await supabase
      .from('zoom_connections')
      .upsert({
        user_id: authState.user_id,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      });

    // Clean up the auth state
    await supabase
      .from('zoom_auth_states')
      .delete()
      .eq('state', state);

    // Set up webhook for this user
    await setupZoomWebhook(authState.user_id, tokens.access_token);

    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/dashboard?success=zoom_connected`);
  } catch (error) {
    console.error('Error in Zoom callback:', error);
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/dashboard?error=callback_failed`);
  }
}

async function setupZoomWebhook(userId: string, accessToken: string) {
  // Get user's Zoom account ID
  const userResponse = await fetch('https://api.zoom.us/v2/users/me', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!userResponse.ok) {
    throw new Error('Failed to get Zoom user info');
  }

  const userData = await userResponse.json();
  const accountId = userData.account_id;

  // Create webhook subscription
  const webhookResponse = await fetch('https://api.zoom.us/v2/webhooks', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: `${process.env.NEXT_PUBLIC_APP_URL}/api/zoom/webhook`,
      events: ['recording.completed'],
      account_id: accountId,
    }),
  });

  if (!webhookResponse.ok) {
    throw new Error('Failed to set up Zoom webhook');
  }

  const webhookData = await webhookResponse.json();

  // Store webhook info in Supabase
  await supabase
    .from('zoom_webhooks')
    .upsert({
      user_id: userId,
      webhook_id: webhookData.id,
      account_id: accountId,
    });
} 