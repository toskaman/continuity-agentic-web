"""Master audio mix for the v2 film (ffmpeg). Voice bus + ducked original music + synthesized SFX, two-pass loudnorm.
Usage: python mix.py master|voiceready|narration  -> out/<name>.wav"""
import json, subprocess, sys, os, re
mode = sys.argv[1] if len(sys.argv) > 1 else "master"
CUES = sys.argv[2] if len(sys.argv) > 2 else "data/cues.json"
MUSIC = sys.argv[3] if len(sys.argv) > 3 else "assets/audio/music_bed.wav"
OUTNAME = sys.argv[4] if len(sys.argv) > 4 else mode
C = json.load(open(CUES)); END = C["end"]
os.makedirs("out", exist_ok=True)
inputs, filt, labels = [], [], []
def inp(path): inputs.extend(["-i", path]); return len(inputs)//2 - 1
# voice bus
if mode in ("master", "narration"):
    vlab = []
    for seg, t in C["vo"].items():
        i = inp(f"assets/audio/{seg}.wav")
        filt.append(f"[{i}:a]aresample=48000,aformat=channel_layouts=stereo,adelay={int(t*1000)}|{int(t*1000)}[v{seg}]"); vlab.append(f"[v{seg}]")
    filt.append(f"{''.join(vlab)}amix=inputs={len(vlab)}:normalize=0,highpass=f=75,equalizer=f=3200:t=q:w=1.2:g=2,acompressor=threshold=-20dB:ratio=2.5:attack=8:release=120:makeup=2,apad=whole_dur={END}[voice]")
    if mode == "narration":
        filt.append("[voice]atrim=0:%s[mix]" % END)
if mode in ("master", "voiceready"):
    m = inp(MUSIC)
    filt.append(f"[{m}:a]aresample=48000,volume={'0.30' if mode=='master' else '0.24'}[mus0]")
    slab = []
    for k, (t, f, g) in enumerate(C["sfx"]):
        i = inp(f"assets/audio/{f}")
        filt.append(f"[{i}:a]aresample=48000,aformat=channel_layouts=stereo,volume={g*0.8:.3f},adelay={int(t*1000)}|{int(t*1000)}[s{k}]"); slab.append(f"[s{k}]")
    filt.append(f"{''.join(slab)}amix=inputs={len(slab)}:normalize=0,apad=whole_dur={END}[sfx]")
    if mode == "master":
        filt.append("[voice]asplit=2[voice1][vkey]")
        filt.append("[mus0][vkey]sidechaincompress=threshold=0.02:ratio=6:attack=40:release=450:makeup=1[mus]")
        filt.append("[voice1][mus][sfx]amix=inputs=3:normalize=0,atrim=0:%s[mix]" % END)
    else:
        filt.append("[mus0][sfx]amix=inputs=2:normalize=0,atrim=0:%s[mix]" % END)
target = {"master": -16, "voiceready": -23, "narration": -16}[mode]
base = ["ffmpeg", "-hide_banner", "-y"] + inputs
fc = ";".join(filt)
# pass 1
r = subprocess.run(base + ["-filter_complex", fc + f";[mix]loudnorm=I={target}:TP=-1.5:LRA=11:print_format=json[o]", "-map", "[o]", "-f", "null", "-"], capture_output=True, text=True)
js = json.loads(re.findall(r"\{[^{}]*\"input_i\"[^{}]*\}", r.stderr)[-1])
ln = f"loudnorm=I={target}:TP=-1.5:LRA=11:measured_I={js['input_i']}:measured_TP={js['input_tp']}:measured_LRA={js['input_lra']}:measured_thresh={js['input_thresh']}:offset={js['target_offset']}:linear=true"
out = f"out/{OUTNAME}.wav"
r2 = subprocess.run(base + ["-filter_complex", fc + f";[mix]{ln},aresample=48000[o]", "-map", "[o]", "-c:a", "pcm_s24le", "-ar", "48000", out], capture_output=True, text=True)
if r2.returncode: print(r2.stderr[-2000:]); sys.exit(1)
m = subprocess.run(["ffmpeg", "-hide_banner", "-i", out, "-af", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True).stderr
I = re.findall(r"I:\s+(-?[\d.]+) LUFS", m)[-1]; TP = re.findall(r"Peak:\s+(-?[\d.]+) dBFS", m)[-1]
print(f"{out}: I={I} LUFS, TP={TP} dBTP")
