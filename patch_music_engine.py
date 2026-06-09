import re

with open('src/audio/MusicEngine.ts', 'r') as f:
    code = f.read()

# 1. quantizedStartStep fix in evalMelodyGen
code = code.replace(
    "const noteTime = (note.quantizedStartStep * stepDuration) + (offsetSeq?.pitches ? 0 : 0);",
    "const noteTime = note.quantizedStartStep * stepDuration;"
)

# 2. previewInstrument gain node fix
preview_patch = """
    // Use a temporary preview gain to route to destination without breaking existing graph
    if (!tgtNode._previewGain) {
      tgtNode._previewGain = new this.Tone.Gain(1).toDestination();
      try { tgtNode.connect(tgtNode._previewGain); } catch (e) { }
    }
    
    if (tgtNode.triggerAttack && tgtNode.triggerRelease) {
      if (tgtNode.name === "AmplitudeEnvelope") {
        if (isDown) tgtNode.triggerAttack(this.Tone.now());
        else tgtNode.triggerRelease(this.Tone.now());
      } else {
        if (isDown) tgtNode.triggerAttack(freq, this.Tone.now());
        else tgtNode.triggerRelease(freq, this.Tone.now());
      }
    }
"""
code = re.sub(
    r"    if \(tgtNode\.triggerAttack && tgtNode\.triggerRelease\) \{[^\}]+if \(tgtNode\.name === \"AmplitudeEnvelope\"\)[^\}]+else[^\}]+}[^\}]+}",
    preview_patch.strip(),
    code
)

with open('src/audio/MusicEngine.ts', 'w') as f:
    f.write(code)
