import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function POST(request: Request, { params }: { params: Promise<{ filename: string }> }) {
  const { filename } = await params;
  try {
    const rawText = await request.text();
    let fileContent = rawText;
    
    // NoiseCraft frontend sometimes sends the payload wrapped in { data: "..." }
    // If it's a JSON object with a string 'data' property, we must unwrap it
    // so the file contains the raw NoiseCraft JSON, not the wrapper.
    try {
      const parsed = JSON.parse(rawText);
      if (parsed && typeof parsed.data === 'string') {
        fileContent = parsed.data;
      }
    } catch (e) {
      // Ignore, it's not JSON wrapped, just use rawText
    }
    
    // Save to Next.js public directory so it's instantly available via URL
    const publicPath = path.join(process.cwd(), 'public', 'noisecraft', 'public', 'examples', filename);
    await fs.writeFile(publicPath, fileContent, 'utf-8');
    
    // Also save to the original source directory so it can be committed to git
    const sourcePath = path.join(process.cwd(), 'noisecraft', 'examples', filename);
    try {
      await fs.writeFile(sourcePath, fileContent, 'utf-8');
    } catch (e) {
      console.warn(`Could not save to source directory: ${e}`);
    }
    
    console.log(`[Local Save] Saved patch: ${filename} to both public/ and noisecraft/examples/`);
    return NextResponse.json({ success: true, path: `/noisecraft/public/examples/${encodeURIComponent(filename)}` });
  } catch (err) {
    console.error('Error saving patch:', err);
    return NextResponse.json({ error: 'Failed to save patch' }, { status: 500 });
  }
}
