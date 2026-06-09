import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function POST(request: Request) {
  try {
    const { name } = await request.json();
    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

    let filename = name.trim();
    if (!filename.endsWith('.ncft')) filename += '.ncft';
    
    // Replace spaces with underscores
    filename = filename.replace(/\s+/g, '_');

    const emptyPatchData = `{"version":2,"nodes":[],"edges":[],"view":{"x":0,"y":0,"zoom":1}}`;

    const publicPath = path.join(process.cwd(), 'public', 'noisecraft', 'public', 'examples', filename);
    await fs.writeFile(publicPath, emptyPatchData, 'utf-8');

    const sourcePath = path.join(process.cwd(), 'noisecraft', 'examples', filename);
    try {
      await fs.writeFile(sourcePath, emptyPatchData, 'utf-8');
    } catch (e) {
      console.warn(`Could not save to source directory: ${e}`);
    }

    return NextResponse.json({ success: true, filename });
  } catch (err) {
    console.error('Error creating patch:', err);
    return NextResponse.json({ error: 'Failed to create patch' }, { status: 500 });
  }
}
