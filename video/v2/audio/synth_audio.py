"""Original music bed + SFX for the CONTINUITY v2 film. Fully synthesized (numpy), no samples,
no third-party material -> no licensing question. Deterministic (seeded).
Usage: python synth_audio.py <outdir>
"""
import sys, os, json
import numpy as np
from scipy.signal import fftconvolve, butter, sosfilt
SR = 48000
rng = np.random.default_rng(20261115)
OUT = sys.argv[1] if len(sys.argv) > 1 else "."
os.makedirs(OUT, exist_ok=True)
T = json.load(open(os.path.join(os.path.dirname(__file__), "timeline.json")))
END = T["end"]

def write(name, x):
    import wave
    x = np.asarray(x, dtype=np.float64)
    if x.ndim == 1: x = np.stack([x, x], 1)
    peak = np.max(np.abs(x)) or 1
    x = x / peak * 0.89
    with wave.open(os.path.join(OUT, name), "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((x * 32767).astype("<i2").tobytes())

def lp(x, fc, order=2):
    return sosfilt(butter(order, min(fc, SR/2*0.95), "low", fs=SR, output="sos"), x)
def hp(x, fc, order=2):
    return sosfilt(butter(order, fc, "high", fs=SR, output="sos"), x)
def env(n, a, d, s=0.0, r=0.0, total=None):
    total = total or n
    e = np.zeros(total)
    ai, di = int(a*SR), int(d*SR)
    e[:ai] = np.linspace(0, 1, ai, endpoint=False) if ai else 0
    e[ai:ai+di] = np.linspace(1, s, di, endpoint=False)[:max(0, min(di, total-ai))]
    e[ai+di:] = s
    if r:
        ri = int(r*SR); e[-ri:] *= np.linspace(1, 0, ri)
    return e
def ir(seconds=2.6, decay=3.2, bright=6000):
    n = int(seconds*SR); t = np.arange(n)/SR
    l = rng.standard_normal(n)*np.exp(-decay*t); r = rng.standard_normal(n)*np.exp(-decay*t)
    return lp(l, bright), lp(r, bright)
IRL, IRR = ir()
def reverb(x, wet=0.3):
    if x.ndim == 1: x = np.stack([x, x], 1)
    l = fftconvolve(x[:,0], IRL)[:len(x)]; r = fftconvolve(x[:,1], IRR)[:len(x)]
    w = np.stack([l, r], 1); w /= (np.max(np.abs(w)) or 1); w *= np.max(np.abs(x))
    return x*(1-wet) + w*wet
def note(m): return 440*2**((m-69)/12)

# ---------------- music bed ----------------
N = int((END+0.5)*SR); t = np.arange(N)/SR
mix = np.zeros((N, 2))
def add(sig, start, gain=1.0, pan=0.0):
    i = int(start*SR); sig = sig[:max(0, N-i)]
    if sig.ndim == 1: sig = np.stack([sig*(1-pan)*0.5*2**0.5, sig*(1+pan)*0.5*2**0.5], 1)
    mix[i:i+len(sig)] += sig*gain

def pad(midis, dur, gain=1.0, cutoff=1800, attack=1.6, release=1.8):
    n = int(dur*SR); tt = np.arange(n)/SR; s = np.zeros(n)
    for m in midis:
        for det in (-0.07, 0.0, 0.06):
            f = note(m+det)
            ph = rng.uniform(0, 2*np.pi)
            s += (2*((f*tt+ph/6.28) % 1)-1)*0.33  # saw
    s = lp(s, cutoff, 4)
    return s*env(n, attack, 0.01, 1.0, release)*gain/len(midis)

def pluck(m, dur=0.9, bright=5000):
    n = int(dur*SR); tt = np.arange(n)/SR; f = note(m)
    s = np.sin(2*np.pi*f*tt)+0.35*np.sin(2*np.pi*2*f*tt)+0.12*np.sin(2*np.pi*3*f*tt)
    return lp(s*np.exp(-tt*5.5), bright)*env(n, 0.004, 0.01, 1.0, 0.05)

S = T["scenes"]  # boundaries
b = lambda k: S[k]
# chords (midi): D major family
Bm = [47, 54, 62, 66]; D = [50, 57, 62, 66, 69]; G = [43, 55, 59, 62, 66]; A = [45, 57, 61, 64, 69]; Dmaj9 = [50, 57, 64, 66, 69]
# S1 tension: Bm pad + slow heartbeat sub
add(pad(Bm, b("S2")+1.2, 0.55, 900, 2.5, 1.5), 0.0)
for k in np.arange(0.9, b("S2")-0.3, 1.25):
    n = int(0.5*SR); tt = np.arange(n)/SR
    add(np.sin(2*np.pi*55*tt)*np.exp(-tt*9)*0.5, k)
# S2 resolve
add(pad(Dmaj9, b("S3")-b("S2")+1.5, 0.75, 2600, 0.9, 1.6), b("S2")-0.2)
# S3 airy: G -> A, sparkle
mid = (b("S3")+b("S4"))/2
add(pad(G, mid-b("S3")+1.2, 0.6, 2200, 1.4, 1.3), b("S3")-0.3)
add(pad(A, b("S4")-mid+1.4, 0.6, 2400, 1.2, 1.4), mid-0.2)
sp = [74, 78, 81, 86, 81, 78]
for i, k in enumerate(np.arange(b("S3")+0.5, b("S4")-0.6, 0.625)):
    add(pluck(sp[i % 6], 1.2, 7000)*0.16, k, pan=(-0.5 if i % 2 else 0.5))
# S4..S9 groove 96 bpm
beat = 60/96; bar = 4*beat
prog = [D, Bm, G, A]
arp = {0: [62, 66, 69, 74], 1: [59, 62, 66, 71], 2: [55, 59, 62, 67], 3: [57, 61, 64, 69]}
start, stop = b("S4")-0.2, b("S10")
k = 0; tcur = start
while tcur < stop:
    ci = (k//2) % 4
    dur = min(bar, stop-tcur)+1.0
    add(pad(prog[ci], dur, 0.42, 1500 + (900 if b("S8") <= tcur < b("S9") else 0), 0.25, 0.9), tcur)
    for j in range(8):
        tt0 = tcur + j*beat/2
        if tt0 >= stop: break
        m = arp[ci][j % 4] + (12 if (b("S8") <= tt0 < b("S9") and j % 2) else 0)
        add(pluck(m, 0.7, 4200)*(0.20 if j % 2 == 0 else 0.13), tt0, pan=0.35*np.sin(j))
    # very soft shaker on offbeats
    for j in range(4):
        tt0 = tcur + j*beat + beat/2
        if tt0 >= stop: break
        n = int(0.06*SR); nz = lp(hp(rng.standard_normal(n), 6000), 9500)*np.exp(-np.arange(n)/SR*60)
        add(nz*0.035, tt0, pan=0.2)
    tcur += bar; k += 1
# S10 final resolve
add(pad(Dmaj9 + [74], END-b("S10")+0.4, 0.95, 3000, 0.4, 3.2), b("S10")-0.1)
for i, m in enumerate([62, 66, 69, 74, 78]):
    add(pluck(m, 2.5, 6000)*0.22, b("S10")+0.15+i*0.12, pan=(i-2)*0.2)
mix = hp(mix.T, 65).T
mix = reverb(mix, 0.32)
fade = np.ones(N); fi = int(0.8*SR); fade[:fi] = np.linspace(0, 1, fi); fo = int(2.6*SR); fade[-fo:] = np.linspace(1, 0, fo)**1.5
mix *= fade[:, None]
write("music_bed.wav", mix)

# ---------------- SFX ----------------
def sfx_click():
    n = int(0.09*SR); tt = np.arange(n)/SR
    s = hp(rng.standard_normal(n), 1800)*np.exp(-tt*140)*0.6 + np.sin(2*np.pi*1650*tt)*np.exp(-tt*90)*0.5 + np.sin(2*np.pi*420*tt)*np.exp(-tt*70)*0.4
    return s
def sfx_tick(f=2400):
    n = int(0.06*SR); tt = np.arange(n)/SR
    return np.sin(2*np.pi*f*tt)*np.exp(-tt*110)
def sfx_whoosh(d=0.9, up=True):
    n = int(d*SR); tt = np.arange(n)/SR; x = rng.standard_normal(n)
    # sweeping band via cascaded moving lowpass approximation
    out = np.zeros(n); seg = 512
    for i in range(0, n, seg):
        p = i/n; fc = (400 + 5200*(p if up else 1-p))
        out[i:i+seg] = lp(x[i:i+seg], fc, 2)
    e = np.sin(np.pi*np.clip(tt/d, 0, 1))**2
    return reverb(out*e, 0.35)
def sfx_chime(m, d=1.6):
    n = int(d*SR); tt = np.arange(n)/SR; f = note(m)
    s = np.sin(2*np.pi*f*tt)*np.exp(-tt*2.8) + 0.4*np.sin(2*np.pi*2.01*f*tt)*np.exp(-tt*4) + 0.15*np.sin(2*np.pi*3.98*f*tt)*np.exp(-tt*6)
    return reverb(s*env(n, 0.003, 0.01, 1.0), 0.4)
def sfx_thud():
    n = int(0.7*SR); tt = np.arange(n)/SR; f = 90*np.exp(-tt*3)+38
    s = np.sin(2*np.pi*np.cumsum(f)/SR)*np.exp(-tt*6) + lp(rng.standard_normal(n), 300)*np.exp(-tt*14)*0.4
    return reverb(s, 0.2)
def sfx_error():
    n = int(0.35*SR); tt = np.arange(n)/SR
    s = (np.sin(2*np.pi*330*tt)+np.sin(2*np.pi*311*tt))*0.5*np.exp(-tt*7)
    s[int(0.14*SR):] += (np.sin(2*np.pi*262*tt[:n-int(0.14*SR)]))*np.exp(-tt[:n-int(0.14*SR)]*8)*0.6
    return lp(s, 2500)
def sfx_flip():
    a = sfx_tick(1800); b2 = sfx_tick(2600); n = int(0.16*SR); s = np.zeros(n); s[:len(a)] += a; s[int(0.07*SR):int(0.07*SR)+len(b2)] += b2*0.8
    return s
def sfx_pulse():
    n = int(0.4*SR); tt = np.arange(n)/SR; f = 880+600*tt
    return reverb(np.sin(2*np.pi*np.cumsum(f)/SR)*np.exp(-tt*9), 0.45)
def sfx_resolve():
    out = np.zeros((int(2.4*SR), 2))
    for i, m in enumerate([74, 78, 81]):
        c = sfx_chime(m, 2.0); out[int(i*0.09*SR):int(i*0.09*SR)+len(c)] += c[:len(out)-int(i*0.09*SR)]*0.6
    return out
def sfx_final():
    out = np.zeros((int(4.0*SR), 2))
    for i, m in enumerate([62, 69, 74, 78, 81]):
        c = sfx_chime(m, 3.6); out[int(i*0.05*SR):int(i*0.05*SR)+len(c)] += c[:len(out)-int(i*0.05*SR)]*0.5
    return out
write("sfx_click.wav", sfx_click()); write("sfx_tick.wav", sfx_tick()); write("sfx_tick_low.wav", sfx_tick(1500))
write("sfx_whoosh.wav", sfx_whoosh()); write("sfx_whoosh_soft.wav", sfx_whoosh(1.3, False))
for name, m in (("sfx_verify_1.wav", 79), ("sfx_verify_2.wav", 83), ("sfx_verify_3.wav", 86)): write(name, sfx_chime(m))
write("sfx_thud.wav", sfx_thud()); write("sfx_error.wav", sfx_error()); write("sfx_flip.wav", sfx_flip())
write("sfx_pulse.wav", sfx_pulse()); write("sfx_resolve.wav", sfx_resolve()); write("sfx_final.wav", sfx_final())
print("ok", END)
