import { NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// Initialize S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const S3_BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME || 'meeting-transcriber-videos';

// Helper function to get video key
const getVideoKey = (userId: string, meetingId: string) => 
  `users/${userId}/meetings/${meetingId}/recording.mp4`;

export async function POST(request: Request) {
  try {
    const { userId, meetingId, recordingUrl } = await request.json();
    
    if (!userId || !meetingId || !recordingUrl) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Download the recording from Zoom
    const response = await fetch(recordingUrl);
    if (!response.ok) {
      throw new Error('Failed to download recording from Zoom');
    }
    
    const videoBuffer = await response.arrayBuffer();
    const key = getVideoKey(userId, meetingId);
    
    // Upload to S3
    await s3Client.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET_NAME,
        Key: key,
        Body: Buffer.from(videoBuffer),
        ContentType: 'video/mp4',
      })
    );

    return NextResponse.json({ success: true, key });
  } catch (error) {
    console.error('Error processing Zoom recording:', error);
    return NextResponse.json(
      { error: 'Failed to process recording' },
      { status: 500 }
    );
  }
} 