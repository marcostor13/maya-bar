#!/usr/bin/env bash
# Uso: ./burn-captions.sh <grabacion> <subtitulos.srt> <salida.mp4>
# Convierte a MP4 (H.264) y quema los subtítulos en inglés, como pide Meta.
set -euo pipefail
in="$1"; srt="$2"; out="$3"
ffmpeg -y -i "$in" \
  -vf "scale='min(1920,iw)':-2,subtitles='${srt}':force_style='FontName=Arial,FontSize=14,PrimaryColour=&HFFFFFF&,BackColour=&H99000000&,BorderStyle=3,Outline=1,Shadow=0,MarginV=30'" \
  -c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p -an -movflags +faststart "$out"
echo "Listo: $out"
