import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function POST(request: Request) {
  try {
    const { oldFilename, newFilename } = await request.json();
    if (!oldFilename || !newFilename) return NextResponse.json({ error: 'Filenames are required' }, { status: 400 });

    let safeNew = newFilename.trim().replace(/\s+/g, '_');
    if (!safeNew.endsWith('.ncft')) safeNew += '.ncft';

    const oldPublicPath = path.join(process.cwd(), 'public', 'noisecraft', 'public', 'examples', oldFilename);
    const newPublicPath = path.join(process.cwd(), 'public', 'noisecraft', 'public', 'examples', safeNew);
    
    try { await fs.rename(oldPublicPath, newPublicPath); } catch (e) {}

    const oldSourcePath = path.join(process.cwd(), 'noisecraft', 'examples', oldFilename);
    const newSourcePath = path.join(process.cwd(), 'noisecraft', 'examples', safeNew);
    
    try { await fs.rename(oldSourcePath, newSourcePath); } catch (e) {}

    return NextResponse.json({ success: true, filename: safeNew });
  } catch (err) {
    console.error('Error renaming patch:', err);
    return NextResponse.json({ error: 'Failed to rename patch' }, { status: 500 });
  }
}
