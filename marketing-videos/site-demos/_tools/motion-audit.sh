#!/usr/bin/env bash
# Numeric motion audit (from the 2026-09-01 ad session): mean per-frame luma delta at 30fps,
# averaged per second. Seconds below 0.05 are frozen frames — exactly what reads as "static".
# Usage: scripts/motion-audit.sh renders/rabta-ad-v1.mp4
set -euo pipefail
f="$1"
ffmpeg -v error -i "$f" -vf "fps=30,tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-" -f null - 2>/dev/null \
 | awk -F'=' '/YAVG/ {n++; s[int((n-1)/30)] += $2; c[int((n-1)/30)]++; total += $2}
   END {
     frozen=0; peak=0;
     for (k=0;k<length(c);k++) { m=s[k]/c[k]; printf("sec %2d  mean-delta %.3f%s\n", k, m, (m<0.05?"  <-- FROZEN":"")); if (m<0.05) frozen++; if (m>peak) peak=m }
     printf("\nframes %d  overall mean %.3f  peak second %.2f  frozen seconds %d / %d\n", n, total/n, peak, frozen, length(c))
   }'
