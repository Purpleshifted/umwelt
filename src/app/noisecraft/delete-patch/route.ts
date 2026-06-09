import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function POST(request: Request) {
  try {
    const { filename } = await request.json();
    if (!filename) return NextResponse.json({ error: 'Filename is required' }, { status: 400 });

    const publicPath = path.join(process.cwd(), 'public', 'noisecraft', 'public', 'examples', filename);
    try { await fs.unlink(publicPath); } catch (e) {}

    const sourcePath = path.join(process.cwd(), 'noisecraft', 'examples', filename);
    try { await fs.unlink(sourcePath); } catch (e) {}

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error deleting patch:', err);
    return NextResponse.json({ error: 'Failed to delete patch' }, { status: 500 });
  }
}
