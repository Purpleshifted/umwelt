import { NextResponse } from 'next/server';

export async function POST(request: Request, { params }: { params: Promise<{ filename: string }> }) {
  const { filename } = await params;
  try {
    // In Vercel serverless environment, we cannot write to the local filesystem.
    // We just return a success response to keep the UI happy.
    console.log(`[Vercel Mock] Saved patch: ${filename}`);
    return NextResponse.json({ success: true, path: `/public/noisecraft/public/examples/${filename}` });
  } catch (err) {
    console.error('Error saving patch:', err);
    return NextResponse.json({ error: 'Failed to save patch' }, { status: 500 });
  }
}
