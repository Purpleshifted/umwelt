import re

with open('src/audio/MusicEngine.ts', 'r') as f:
    code = f.read()

# 3. syncGraph incremental reconciliation
old_sync = """    // 2. Dispose old Nodes and Parts
    this.nodeMap.forEach(node => {
      if (node.dispose) {
        try { node.dispose(); } catch (e) { }
      }
    });
    this.nodeMap.clear();

    for (const part of this.activeToneParts) {
      part.dispose();
    }
    this.activeToneParts = [];
    this.activeToneNodes = [];
    this.activeParams = [];

    // 3. Create Audio Nodes
    for (const mod of state.modules) {"""

new_sync = """    // 2. Disconnect existing nodes and dispose removed nodes
    const currentModuleIds = new Set(state.modules.map(m => m.id));
    
    this.nodeMap.forEach(node => {
      if (node.disconnect) {
        try { node.disconnect(); } catch (e) { }
      }
    });

    for (const [id, node] of this.nodeMap.entries()) {
      if (!currentModuleIds.has(id)) {
        if (node.dispose) {
          try { node.dispose(); } catch (e) { }
        }
        this.nodeMap.delete(id);
      }
    }

    for (const part of this.activeToneParts) {
      part.dispose();
    }
    this.activeToneParts = [];
    this.activeToneNodes = [];
    this.activeParams = [];

    // 3. Create OR Update Audio Nodes
    for (const mod of state.modules) {
      let existingNode = this.nodeMap.get(mod.id);"""

code = code.replace(old_sync, new_sync)

old_nodes = """      if (mod.type === 'oscillator') {
        let type = mod.oscillatorConfig?.type || 'sine';
        if (type === 'pinknoise' || type === 'whitenoise') type = 'sine';
        const osc = new this.Tone.Oscillator(440, type as any).start();
        osc.volume.value = this.Tone.gainToDb(Math.max(0.0001, 2.0 * (mod.oscillatorConfig?.volume ?? 0.5)));
        this.nodeMap.set(mod.id, osc);
        this.activeToneNodes.push(osc);
      } else if (mod.type === 'noise') {
        const noise = new this.Tone.Noise("white").start();
        this.nodeMap.set(mod.id, noise);
        this.activeToneNodes.push(noise);
      } else if (mod.type === 'polysynth') {
        const type = mod.polysynthConfig?.oscillatorType || 'sine';
        const synth = new this.Tone.PolySynth(this.Tone.Synth, {
          oscillator: { type: type as any },
          envelope: {
            attack: mod.polysynthConfig?.attack || 0.1,
            decay: mod.polysynthConfig?.decay || 0.2,
            sustain: mod.polysynthConfig?.sustain || 0.5,
            release: mod.polysynthConfig?.release || 1,
          }
        });
        synth.volume.value = this.Tone.gainToDb(Math.max(0.0001, 2.0 * (mod.polysynthConfig?.volume ?? 0.8)));
        this.nodeMap.set(mod.id, synth);
        this.activeToneNodes.push(synth);
      } else if (mod.type === 'virtual_instrument') {
        const { getSamplerEngine } = await import('./SamplerEngine');
        const sampler = await getSamplerEngine().getInstrument(mod.virtualInstrumentConfig?.instrument || 'acoustic_grand_piano');
        if (sampler) {
          (sampler as any).volume.value = this.Tone.gainToDb(Math.max(0.0001, 2.0 * (mod.virtualInstrumentConfig?.volume ?? 0.8)));
          this.nodeMap.set(mod.id, sampler);
          this.activeToneNodes.push(sampler);
        }
      } else if (mod.type === 'adsr_envelope') {
        const env = new this.Tone.AmplitudeEnvelope({
          attack: mod.adsrEnvelopeConfig?.attack || 0.1,
          decay: mod.adsrEnvelopeConfig?.decay || 0.2,
          sustain: mod.adsrEnvelopeConfig?.sustain || 0.5,
          release: mod.adsrEnvelopeConfig?.release || 1
        });
        this.nodeMap.set(mod.id, env);
        this.activeToneNodes.push(env);
      } else if (mod.type === 'filter') {
        const filter = new this.Tone.Filter({
          type: mod.filterConfig?.type || 'lowpass',
          frequency: mod.filterConfig?.frequency || 1000,
          Q: mod.filterConfig?.Q || 1
        });
        this.nodeMap.set(mod.id, filter);
        this.activeToneNodes.push(filter);
      } else if (mod.type === 'reverb') {
        const rev = new this.Tone.Reverb({
          decay: mod.reverbConfig?.decay || 1.5,
          preDelay: mod.reverbConfig?.preDelay || 0.01,
          wet: mod.reverbConfig?.wet || 0.5
        });
        await rev.generate();
        this.nodeMap.set(mod.id, rev);
        this.activeToneNodes.push(rev);
      } else if (mod.type === 'player_node') {
        const env = new this.Tone.AmplitudeEnvelope({ attack: 0.02, decay: 0.1, sustain: 1.0, release: 0.1 });
        this.nodeMap.set(mod.id, env);
        this.activeToneNodes.push(env);
      } else if (mod.type === 'pedal_fx') {
        let fxNode: any = null;
        const pType = mod.pedalFxConfig?.effectType || 'reverb';
        if (pType === 'reverb') {
          fxNode = new this.Tone.Reverb({ decay: mod.pedalFxConfig?.param1 || 1.5, preDelay: mod.pedalFxConfig?.param2 || 0.01, wet: mod.pedalFxConfig?.mix || 0.5 });
        } else if (pType === 'delay') {
          fxNode = new this.Tone.FeedbackDelay({ delayTime: mod.pedalFxConfig?.param1 || 0.25, feedback: mod.pedalFxConfig?.param2 || 0.5, wet: mod.pedalFxConfig?.mix || 0.5 });
        } else if (pType === 'distortion') {
          fxNode = new this.Tone.Distortion({ distortion: mod.pedalFxConfig?.param1 || 0.5, wet: mod.pedalFxConfig?.mix || 0.5 });
        } else if (pType === 'chorus') {
          fxNode = new this.Tone.Chorus({ frequency: mod.pedalFxConfig?.param1 ? mod.pedalFxConfig.param1 * 10 : 4, depth: mod.pedalFxConfig?.param2 || 0.5, wet: mod.pedalFxConfig?.mix || 0.5 }).start();
        }
        if (fxNode) {
          this.nodeMap.set(mod.id, fxNode);
          this.activeToneNodes.push(fxNode);
        }
      } else if (mod.type === 'mix_node' || mod.type === 'null_node') {
        const gain = new this.Tone.Gain(1);
        this.nodeMap.set(mod.id, gain);
        this.activeToneNodes.push(gain);
      } else if (mod.type === 'lfo') {
        const lfo = new this.Tone.LFO(mod.lfoConfig?.rate || 1.0, 0.1, 20).start();
        this.nodeMap.set(mod.id, lfo);
        this.activeToneNodes.push(lfo);
      } else if (mod.type === 'out_node') {
        const hasTrigger = state.edges.some(e => e.target === mod.id && e.targetHandle === 'trigger_in');
        const defaultGain = hasTrigger ? 0 : (mod.outConfig?.muted ? 0 : 1);
        const gain = new this.Tone.Gain(defaultGain);
        gain.toDestination();
        this.nodeMap.set(mod.id, gain);
        this.activeToneNodes.push(gain);
      } else if (mod.type === 'broadcast_node' || mod.type === 'score_out' || mod.type === 'track_out') {
        const hasTrigger = state.edges.some(e => e.target === mod.id && e.targetHandle === 'trigger_in');
        const defaultGain = hasTrigger ? 0 : 1;
        const gain = new this.Tone.Gain(defaultGain);
        this.nodeMap.set(mod.id, gain);
        this.activeToneNodes.push(gain);

        const channelName = mod.broadcastConfig?.channel || mod.scoreOutConfig?.channel || mod.trackOutConfig?.trackName || 'A';
        const { useAudioGraphStore, getTrackBus } = await import('@/store/audioGraphStore');
        const audioCtx = useAudioGraphStore.getState().audioContext;
        if (audioCtx) {
          const bus = getTrackBus(audioCtx, channelName);
          this.Tone.connect(gain, bus);
        } else {
          gain.toDestination();
        }
      }"""

new_nodes = """      if (mod.type === 'oscillator') {
        let type = mod.oscillatorConfig?.type || 'sine';
        if (existingNode) {
          if (type === 'pinknoise' || type === 'whitenoise') {
            if (!(existingNode instanceof this.Tone.Noise)) {
               existingNode.dispose();
               existingNode = new this.Tone.Noise(type === 'pinknoise' ? 'pink' : 'white').start();
               this.nodeMap.set(mod.id, existingNode);
            } else {
               existingNode.type = type === 'pinknoise' ? 'pink' : 'white';
            }
          } else {
            if (!(existingNode instanceof this.Tone.Oscillator)) {
               existingNode.dispose();
               existingNode = new this.Tone.Oscillator(440, type as any).start();
               this.nodeMap.set(mod.id, existingNode);
            } else {
               existingNode.type = type as any;
            }
          }
        } else {
          if (type === 'pinknoise' || type === 'whitenoise') {
            existingNode = new this.Tone.Noise(type === 'pinknoise' ? 'pink' : 'white').start();
          } else {
            existingNode = new this.Tone.Oscillator(440, type as any).start();
          }
          this.nodeMap.set(mod.id, existingNode);
        }
        existingNode.volume.value = this.Tone.gainToDb(Math.max(0.0001, 2.0 * (mod.oscillatorConfig?.volume ?? 0.5)));
        this.activeToneNodes.push(existingNode);
      } else if (mod.type === 'noise') {
        if (!existingNode) {
          existingNode = new this.Tone.Noise("white").start();
          this.nodeMap.set(mod.id, existingNode);
        }
        this.activeToneNodes.push(existingNode);
      } else if (mod.type === 'polysynth') {
        const type = mod.polysynthConfig?.oscillatorType || 'sine';
        if (existingNode) {
           existingNode.set({
             oscillator: { type: type as any },
             envelope: {
               attack: mod.polysynthConfig?.attack || 0.1,
               decay: mod.polysynthConfig?.decay || 0.2,
               sustain: mod.polysynthConfig?.sustain || 0.5,
               release: mod.polysynthConfig?.release || 1,
             }
           });
        } else {
          existingNode = new this.Tone.PolySynth(this.Tone.Synth, {
            oscillator: { type: type as any },
            envelope: {
              attack: mod.polysynthConfig?.attack || 0.1,
              decay: mod.polysynthConfig?.decay || 0.2,
              sustain: mod.polysynthConfig?.sustain || 0.5,
              release: mod.polysynthConfig?.release || 1,
            }
          });
          this.nodeMap.set(mod.id, existingNode);
        }
        existingNode.volume.value = this.Tone.gainToDb(Math.max(0.0001, 2.0 * (mod.polysynthConfig?.volume ?? 0.8)));
        this.activeToneNodes.push(existingNode);
      } else if (mod.type === 'virtual_instrument') {
        const { getSamplerEngine } = await import('./SamplerEngine');
        existingNode = await getSamplerEngine().getInstrument(mod.virtualInstrumentConfig?.instrument || 'acoustic_grand_piano');
        if (existingNode) {
          (existingNode as any).volume.value = this.Tone.gainToDb(Math.max(0.0001, 2.0 * (mod.virtualInstrumentConfig?.volume ?? 0.8)));
          this.nodeMap.set(mod.id, existingNode);
          this.activeToneNodes.push(existingNode);
        }
      } else if (mod.type === 'adsr_envelope') {
        if (existingNode) {
          existingNode.attack = mod.adsrEnvelopeConfig?.attack || 0.1;
          existingNode.decay = mod.adsrEnvelopeConfig?.decay || 0.2;
          existingNode.sustain = mod.adsrEnvelopeConfig?.sustain || 0.5;
          existingNode.release = mod.adsrEnvelopeConfig?.release || 1;
          if (existingNode._cvEnvelope) {
            existingNode._cvEnvelope.attack = mod.adsrEnvelopeConfig?.attack || 0.1;
            existingNode._cvEnvelope.decay = mod.adsrEnvelopeConfig?.decay || 0.2;
            existingNode._cvEnvelope.sustain = mod.adsrEnvelopeConfig?.sustain || 0.5;
            existingNode._cvEnvelope.release = mod.adsrEnvelopeConfig?.release || 1;
          }
        } else {
          existingNode = new this.Tone.AmplitudeEnvelope({
            attack: mod.adsrEnvelopeConfig?.attack || 0.1,
            decay: mod.adsrEnvelopeConfig?.decay || 0.2,
            sustain: mod.adsrEnvelopeConfig?.sustain || 0.5,
            release: mod.adsrEnvelopeConfig?.release || 1
          });
          existingNode._cvEnvelope = new this.Tone.Envelope({
            attack: mod.adsrEnvelopeConfig?.attack || 0.1,
            decay: mod.adsrEnvelopeConfig?.decay || 0.2,
            sustain: mod.adsrEnvelopeConfig?.sustain || 0.5,
            release: mod.adsrEnvelopeConfig?.release || 1
          });
          this.nodeMap.set(mod.id, existingNode);
        }
        this.activeToneNodes.push(existingNode);
      } else if (mod.type === 'filter') {
        if (existingNode) {
          existingNode.type = mod.filterConfig?.type || 'lowpass';
          existingNode.frequency.value = mod.filterConfig?.frequency || 1000;
          existingNode.Q.value = mod.filterConfig?.Q || 1;
        } else {
          existingNode = new this.Tone.Filter({
            type: mod.filterConfig?.type || 'lowpass',
            frequency: mod.filterConfig?.frequency || 1000,
            Q: mod.filterConfig?.Q || 1
          });
          this.nodeMap.set(mod.id, existingNode);
        }
        this.activeToneNodes.push(existingNode);
      } else if (mod.type === 'reverb') {
        if (existingNode) {
          existingNode.decay = mod.reverbConfig?.decay || 1.5;
          existingNode.preDelay = mod.reverbConfig?.preDelay || 0.01;
          existingNode.wet.value = mod.reverbConfig?.wet || 0.5;
        } else {
          existingNode = new this.Tone.Reverb({
            decay: mod.reverbConfig?.decay || 1.5,
            preDelay: mod.reverbConfig?.preDelay || 0.01,
            wet: mod.reverbConfig?.wet || 0.5
          });
          await existingNode.generate();
          this.nodeMap.set(mod.id, existingNode);
        }
        this.activeToneNodes.push(existingNode);
      } else if (mod.type === 'player_node') {
        if (!existingNode) {
          existingNode = new this.Tone.AmplitudeEnvelope({ attack: 0.02, decay: 0.1, sustain: 1.0, release: 0.1 });
          this.nodeMap.set(mod.id, existingNode);
        }
        this.activeToneNodes.push(existingNode);
      } else if (mod.type === 'pedal_fx') {
        const pType = mod.pedalFxConfig?.effectType || 'reverb';
        let needsRecreate = !existingNode;
        if (existingNode) {
           if (pType === 'reverb' && !(existingNode instanceof this.Tone.Reverb)) needsRecreate = true;
           if (pType === 'delay' && !(existingNode instanceof this.Tone.FeedbackDelay)) needsRecreate = true;
           if (pType === 'distortion' && !(existingNode instanceof this.Tone.Distortion)) needsRecreate = true;
           if (pType === 'chorus' && !(existingNode instanceof this.Tone.Chorus)) needsRecreate = true;
        }

        if (needsRecreate) {
           if (existingNode) existingNode.dispose();
           if (pType === 'reverb') {
             existingNode = new this.Tone.Reverb({ decay: 2, wet: 0.5 });
             await (existingNode as any).generate();
           } else if (pType === 'delay') {
             existingNode = new this.Tone.FeedbackDelay("8n", 0.5);
           } else if (pType === 'distortion') {
             existingNode = new this.Tone.Distortion(0.5);
           } else if (pType === 'chorus') {
             existingNode = new this.Tone.Chorus(4, 2.5, 0.5).start();
           }
           this.nodeMap.set(mod.id, existingNode);
        } else {
           if (pType === 'reverb') {
             existingNode.wet.value = mod.pedalFxConfig?.mix ?? 0.5;
           } else if (pType === 'delay') {
             existingNode.delayTime.value = Math.max(0.01, mod.pedalFxConfig?.param1 ?? 0.25);
             existingNode.feedback.value = Math.max(0, mod.pedalFxConfig?.param2 ?? 0.5);
             existingNode.wet.value = mod.pedalFxConfig?.mix ?? 0.5;
           } else if (pType === 'distortion') {
             existingNode.distortion = mod.pedalFxConfig?.param1 ?? 0.5;
             existingNode.wet.value = mod.pedalFxConfig?.mix ?? 0.5;
           } else if (pType === 'chorus') {
             existingNode.frequency.value = mod.pedalFxConfig?.param1 ? mod.pedalFxConfig.param1 * 10 : 4;
             existingNode.depth = mod.pedalFxConfig?.param2 ?? 0.5;
             existingNode.wet.value = mod.pedalFxConfig?.mix ?? 0.5;
           }
        }
        this.activeToneNodes.push(existingNode);
      } else if (mod.type === 'mix_node' || mod.type === 'null_node') {
        if (!existingNode) {
          existingNode = new this.Tone.Gain(1);
          this.nodeMap.set(mod.id, existingNode);
        }
        this.activeToneNodes.push(existingNode);
      } else if (mod.type === 'lfo') {
        if (!existingNode) {
          existingNode = new this.Tone.LFO(mod.lfoConfig?.rate || 1.0, 0.1, 20).start();
          this.nodeMap.set(mod.id, existingNode);
        } else {
          existingNode.frequency.value = mod.lfoConfig?.rate || 1.0;
        }
        this.activeToneNodes.push(existingNode);
      } else if (mod.type === 'out_node') {
        const hasTrigger = state.edges.some(e => e.target === mod.id && e.targetHandle === 'trigger_in');
        const defaultGain = hasTrigger ? 0 : (mod.outConfig?.muted ? 0 : 1);
        if (!existingNode) {
          existingNode = new this.Tone.Gain(defaultGain);
          this.nodeMap.set(mod.id, existingNode);
        } else {
          existingNode.gain.value = defaultGain;
        }
        existingNode.toDestination(); // Re-route to destination since we disconnected it
        this.activeToneNodes.push(existingNode);
      } else if (mod.type === 'broadcast_node' || mod.type === 'score_out' || mod.type === 'track_out') {
        const hasTrigger = state.edges.some(e => e.target === mod.id && e.targetHandle === 'trigger_in');
        const defaultGain = hasTrigger ? 0 : 1;
        
        if (!existingNode) {
          existingNode = new this.Tone.Gain(defaultGain);
          this.nodeMap.set(mod.id, existingNode);
        } else {
          existingNode.gain.value = defaultGain;
        }
        
        const channelName = mod.broadcastConfig?.channel || mod.scoreOutConfig?.channel || mod.trackOutConfig?.trackName || 'A';
        const { useAudioGraphStore, getTrackBus } = await import('@/store/audioGraphStore');
        const audioCtx = useAudioGraphStore.getState().audioContext;
        if (audioCtx) {
          const bus = getTrackBus(audioCtx, channelName);
          this.Tone.connect(existingNode, bus);
        } else {
          existingNode.toDestination();
        }
        
        this.activeToneNodes.push(existingNode);
      }"""

code = code.replace(old_nodes, new_nodes)

old_conn = """    for (const edge of state.edges) {
      const srcNode = edge.sourceHandle === 'fx_out' ? this.nodeMap.get(edge.source) : audioSourceMap.get(edge.source);
      const tgtNode = this.nodeMap.get(edge.target);
      const tgtMod = state.modules.find(m => m.id === edge.target);

      // Connect Audio to Audio
      if (srcNode && tgtNode && srcNode.connect && tgtMod) {
        if (edge.targetHandle !== 'sequence' && edge.targetHandle !== 'trigger' && edge.targetHandle !== 'frequency' && edge.targetHandle !== 'q' && edge.targetHandle !== 'rate' && edge.targetHandle !== 'trigger_in' && edge.targetHandle !== 'fx_in') {
          try { srcNode.connect(tgtNode); } catch (e) { }
        }
      }"""

new_conn = """    for (const edge of state.edges) {
      let srcNode = audioSourceMap.has(edge.source) ? audioSourceMap.get(edge.source) : this.nodeMap.get(edge.source);
      
      // If source handle is cv_out, return the internal CV Envelope
      if (edge.sourceHandle === 'cv_out' && srcNode && srcNode._cvEnvelope) {
        srcNode = srcNode._cvEnvelope;
      }
      
      const tgtNode = this.nodeMap.get(edge.target);
      const tgtMod = state.modules.find(m => m.id === edge.target);

      // Connect Audio to Audio OR Audio to Param
      if (srcNode && tgtNode && srcNode.connect && tgtMod) {
        if (['sequence', 'trigger', 'trigger_in', 'fx_in'].includes(edge.targetHandle!)) {
           // Skip sequence and triggers
        } else if (['frequency', 'q', 'rate', 'volume', 'gain_sine', 'gain_saw', 'gain_square', 'gain_tri'].includes(edge.targetHandle!)) {
           // It's an AudioParam!
           let param: any = null;
           if (edge.targetHandle === 'frequency') param = tgtNode.frequency;
           if (edge.targetHandle === 'q') param = tgtNode.Q;
           if (edge.targetHandle === 'rate') param = tgtNode.frequency; // For LFO
           if (edge.targetHandle === 'volume') param = tgtNode.volume;
           
           if (edge.targetHandle.startsWith('gain_')) {
             const wfGainNode = this.nodeMap.get(`${edge.target}:${edge.targetHandle}`);
             if (wfGainNode && (wfGainNode as any).gain) param = (wfGainNode as any).gain;
           }

           if (param && param.connect === undefined) {
               try { srcNode.connect(param); } catch (e) { }
           }
        } else {
           // Normal audio connection
           try { srcNode.connect(tgtNode); } catch (e) { }
        }
      }"""

code = code.replace(old_conn, new_conn)

# Trigger ADSR CV
old_trig = """                   if (isNoteOn) {
                      // Determine freq/pitch
                      let freq = 440;
                      if ((m as any).freq) freq = (m as any).freq;
                      else if ((m as any).pitch) freq = Tone.Frequency((m as any).pitch, "midi").toFrequency();
                      
                      tgtNode.triggerAttack(freq, time);
                   } else if (isNoteOff) {
                      tgtNode.triggerRelease(time);
                   } else if (typeof m === 'number') {
                      if (m > 0) tgtNode.triggerAttack(440, time);
                      else tgtNode.triggerRelease(time);
                   }"""

new_trig = """                   if (isNoteOn) {
                      // Determine freq/pitch
                      let freq = 440;
                      if ((m as any).freq) freq = (m as any).freq;
                      else if ((m as any).pitch) freq = Tone.Frequency((m as any).pitch, "midi").toFrequency();
                      
                      tgtNode.triggerAttack(freq, time);
                      if (tgtNode._cvEnvelope) tgtNode._cvEnvelope.triggerAttack(time);
                   } else if (isNoteOff) {
                      tgtNode.triggerRelease(time);
                      if (tgtNode._cvEnvelope) tgtNode._cvEnvelope.triggerRelease(time);
                   } else if (typeof m === 'number') {
                      if (m > 0) {
                        tgtNode.triggerAttack(440, time);
                        if (tgtNode._cvEnvelope) tgtNode._cvEnvelope.triggerAttack(time);
                      } else {
                        tgtNode.triggerRelease(time);
                        if (tgtNode._cvEnvelope) tgtNode._cvEnvelope.triggerRelease(time);
                      }
                   }"""
code = code.replace(old_trig, new_trig)

old_trig2 = """    if (isContinuous) {
      if (chain.triggerNode?.triggerAttack) {
        chain.triggerNode.triggerAttack(this.Tone.Frequency("C4").toFrequency());
      } else if (chain.triggerNode?.start) {
        chain.triggerNode.start();
      }
    } else {"""
new_trig2 = """    if (isContinuous) {
      if (chain.triggerNode?.triggerAttack) {
        chain.triggerNode.triggerAttack(this.Tone.Frequency("C4").toFrequency());
        if (chain.triggerNode._cvEnvelope) chain.triggerNode._cvEnvelope.triggerAttack();
      } else if (chain.triggerNode?.start) {
        chain.triggerNode.start();
      }
    } else {"""
code = code.replace(old_trig2, new_trig2)

# evaluateDAG getVal
old_eval = """        const getVal = (handleId: string) => {
          const e = state.edges.find(e => e.target === m.id && e.targetHandle === handleId);
          if (e) {
            const src = state.modules.find(x => x.id === e.source);
            if (src?.type === 'slider') return src.sliderConfig?.value;
            if (src?.type === 'lfo') return results[src.id];
            if (src?.type === 'seq_to_freq') {"""
new_eval = """        const getVal = (handleId: string) => {
          const e = state.edges.find(e => e.target === m.id && e.targetHandle === handleId);
          if (e) {
            const src = state.modules.find(x => x.id === e.source);
            if (src?.type === 'slider') return src.sliderConfig?.value;
            if (src?.type === 'knob') return src.knobConfig?.value;
            if (src?.type === 'lfo') return results[src.id];
            if (src?.type === 'virtual_stream') return undefined; // Streams are handled via fast CV Polling
            if (src?.type === 'seq_to_freq') {"""
code = code.replace(old_eval, new_eval)

# cv polling
old_cv = """        let rawVal: number | undefined = undefined;
        if (srcMod.type === 'slider') {
          rawVal = srcMod.sliderConfig?.value;
        } else if (srcMod.type === 'virtual_stream' && srcMod.inputStreamId) {
          rawVal = evaluateStreamValue(srcMod.inputStreamId, streams, sensorValues);
        }

        if (rawVal === undefined) continue;

        const normalized = Math.max(0, Math.min(1, rawVal));
        let finalVal = rawVal;

        let multiplier = 1.0;
        let globalScale = 1.0;
        const tgtMod = state.modules.find(m => m.id === ap.modId);
        if (tgtMod) {
          if (tgtMod.type === 'polysynth') { multiplier = tgtMod.polysynthConfig?.volume ?? 0.8; globalScale = 1.0; }
          else if (tgtMod.type === 'virtual_instrument') { multiplier = tgtMod.virtualInstrumentConfig?.volume ?? 0.8; globalScale = 1.0; }
          else if (tgtMod.type === 'oscillator') { multiplier = tgtMod.oscillatorConfig?.volume ?? 0.8; globalScale = 1.0; }
          else if (tgtMod.type === 'player_out') { multiplier = tgtMod.playerOutConfig?.volume ?? 0.8; }
          else if (tgtMod.type === 'track_out') { multiplier = tgtMod.trackOutConfig?.volume ?? 0.8; }
        }

        if (ap.type === 'freq') {
          finalVal = 20 * Math.pow(1000, normalized);
        } else if (ap.type === 'q' || ap.type === 'rate') {
          // Logarithmic scale for Q/rate: 0.1 to 20
          finalVal = 0.1 * Math.pow(200, normalized);
        } else if (ap.type === 'volume') {"""

new_cv = """        let rawVal: number | undefined = undefined;
        if (srcMod.type === 'slider') {
          rawVal = srcMod.sliderConfig?.value;
        } else if (srcMod.type === 'knob') {
          rawVal = srcMod.knobConfig?.value;
        } else if (srcMod.type === 'virtual_stream' && srcMod.inputStreamId) {
          rawVal = evaluateStreamValue(srcMod.inputStreamId, streams, sensorValues);
        }

        if (rawVal === undefined) continue;

        const normalized = Math.max(0, Math.min(1, rawVal));
        let finalVal = rawVal;

        let multiplier = 1.0;
        let globalScale = 1.0;
        const tgtMod = state.modules.find(m => m.id === ap.modId);
        if (tgtMod) {
          if (tgtMod.type === 'polysynth') { multiplier = tgtMod.polysynthConfig?.volume ?? 0.8; globalScale = 1.0; }
          else if (tgtMod.type === 'virtual_instrument') { multiplier = tgtMod.virtualInstrumentConfig?.volume ?? 0.8; globalScale = 1.0; }
          else if (tgtMod.type === 'oscillator') { multiplier = tgtMod.oscillatorConfig?.volume ?? 0.8; globalScale = 1.0; }
          else if (tgtMod.type === 'player_out') { multiplier = tgtMod.playerOutConfig?.volume ?? 0.8; }
          else if (tgtMod.type === 'track_out') { multiplier = tgtMod.trackOutConfig?.volume ?? 0.8; }
        }

        if (ap.type === 'frequency') {
          finalVal = 20 * Math.pow(1000, normalized);
          if (tgtMod && tgtMod.id) {
            const currentOutputs = useMusicStore.getState().nodeOutputs;
            if (currentOutputs[tgtMod.id] && currentOutputs[tgtMod.id].freq !== finalVal) {
              currentOutputs[tgtMod.id].freq = finalVal;
            }
          }
        } else if (ap.type === 'q' || ap.type === 'rate') {
          // Logarithmic scale for Q/rate: 0.1 to 20
          finalVal = 0.1 * Math.pow(200, normalized);
          if (tgtMod && tgtMod.id) {
            const currentOutputs = useMusicStore.getState().nodeOutputs;
            if (ap.type === 'q' && currentOutputs[tgtMod.id] && currentOutputs[tgtMod.id].q !== finalVal) {
              currentOutputs[tgtMod.id].q = finalVal;
            }
          }
        } else if (ap.type === 'volume') {"""
code = code.replace(old_cv, new_cv)

with open('src/audio/MusicEngine.ts', 'w') as f:
    f.write(code)
