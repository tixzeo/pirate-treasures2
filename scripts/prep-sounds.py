# Turns Артем's Freesound downloads (see public/sounds/CREDITS.md) into the game's sound files: seamless loops
# and single calls, levelled and squeezed to Ogg Vorbis. Usage: python3 scripts/prep-sounds.py <downloads dir> public/sounds
import sys, os, glob, subprocess, tempfile, numpy as np
SR = 44100
src_dir, out_dir = sys.argv[1], sys.argv[2]
os.makedirs(out_dir, exist_ok=True)
def find(fid): return glob.glob(os.path.join(src_dir, f'{fid}__*'))[0]
def load(fid, start=0, dur=None, ch=2, af=None):
    cmd = ['ffmpeg','-v','error','-ss',str(start),'-i',find(fid)] + (['-t',str(dur)] if dur else []) + (['-af',af] if af else []) + ['-ac',str(ch),'-ar',str(SR),'-f','f32le','-']
    return np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, np.float32).reshape(-1, ch).copy()
def lufs(x):
    with tempfile.NamedTemporaryFile(suffix='.wav') as t:
        write_wav(t.name, x)
        out = subprocess.run(['ffmpeg','-nostats','-i',t.name,'-af','ebur128','-f','null','-'], capture_output=True, text=True).stderr
    return float([l for l in out.splitlines() if l.strip().startswith('I:')][-1].split()[1])
def write_wav(path, x):
    subprocess.run(['ffmpeg','-v','error','-y','-f','f32le','-ar',str(SR),'-ac',str(x.shape[1]),'-i','-',path], input=x.astype(np.float32).tobytes(), check=True)
def save(name, x, q=3):
    path = os.path.join(out_dir, f'{name}.ogg')
    subprocess.run(['ffmpeg','-v','error','-y','-f','f32le','-ar',str(SR),'-ac',str(x.shape[1]),'-i','-','-c:a','libvorbis','-q:a',str(q),path],
                   input=x.astype(np.float32).tobytes(), check=True)
    peak = 20*np.log10(np.abs(x).max()+1e-9)
    print(f'{name:16s} {len(x)/SR:5.1f}s {x.shape[1]}ch peak {peak:5.1f} dB  {lufs(x):6.1f} LUFS  {os.path.getsize(path)//1024} KB')
def level(x, target_lufs=None, peak_db=-1.0):
    g = 10**(peak_db/20) / (np.abs(x).max()+1e-9)  # as loud as the peaks allow...
    if target_lufs is not None: g = min(g, 10**((target_lufs - lufs(x))/20))  # ...or as loud as asked
    return x * g
def fades(x, fin, fout):
    n, m = int(fin*SR), int(fout*SR)
    if n: x[:n] *= np.linspace(0, 1, n)[:, None]
    if m: x[-m:] *= np.linspace(1, 0, m)[:, None] ** 2
    return x
def loop(fid, start, length, ch=2, xfade=3.0, af=None):
    seg = load(fid, start, length + xfade, ch, af); L, X = int(length*SR), int(xfade*SR)
    t = np.linspace(0, np.pi/2, X)[:, None]
    out = seg[:L].copy()
    out[:X] = seg[:X]*np.sin(t) + seg[L:L+X]*np.cos(t)  # the tail runs into the head: no seam when it wraps
    return out

# Loops, levelled to the same loudness so ambience.js trims them with plain numbers.
LOOP_LUFS = -20
# Knocks and breakers stick out of these takes: tame the peaks so the bed can reach the common loudness.
TAME = 'acompressor=threshold=-26dB:ratio=4:attack=5:release=250:makeup=1'
for name, fid, start, length, ch, af in [
    ('hull', 265553, 142, 40, 2, TAME),      # water slapping and lines straining, from inside a moored boat
    ('bow', 360631, 0, 30, 2, None),               # bow wave of a sailing boat under way
    ('surf', 531015, 12, 40, 1, TAME),            # waves on a beach; mono, it is placed at the nearest shore
    ('rigging', 360632, 57, 30, 2, None),         # light air in the rigging
    ('rigging-strong', 360633, 73, 30, 2, None),  # fresh wind in the rigging
    ('sails', 245839, 8, 20, 2, TAME),            # canvas flapping
    ('storm', 59818, 3, 30, 2, None),             # storm wind
]:
    save(name, level(loop(fid, start, length, ch, af=af), LOOP_LUFS), q=2)

# Hull creaks: the loudest moments of a long creaking take, well apart.
x = load(483355, ch=1); env = np.convolve(x[:,0]**2, np.ones(SR//10)/(SR//10), 'same')
order = np.argsort(env[::SR//20])[::-1] * (SR//20); picks = []
for p in order:
    if p > SR and p < len(x) - 2*SR and all(abs(p-q) > 6*SR for q in picks): picks.append(p)
    if len(picks) == 4: break
for i, p in enumerate(sorted(picks)):
    save(f'creak-{i+1}', level(fades(x[p-SR:p+int(1.5*SR)].copy(), .35, .7), -16), q=3)

# Gulls: one clean call, and three moments from a gull over the Pacific.
save('gull-1', level(fades(load(73497, ch=1), .02, .2), -18), q=3)
for i, (a, b) in enumerate([(8.35, 9.1), (3.1, 6.8), (12.5, 16.7)]):
    save(f'gull-{i+2}', level(fades(load(586831, a, b-a, ch=1, af='highpass=f=300'), .03, .25), -18), q=3)

# Battle: two cannon shots from one take, a big splash, a wooden hit.
for i, (a, b) in enumerate([(0.05, 5.6), (6.25, 11.8)]):
    save(f'cannon-{i+1}', level(fades(load(187767, a, b-a), .005, 1.2)), q=3)
save('splash-1', level(fades(load(442773), .005, .3)), q=3)
save('hit-1', level(fades(load(774149), .005, .3)), q=3)
