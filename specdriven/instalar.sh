#!/usr/bin/env bash
# Copia la skill y el agente de specdriven a .claude/ del proyecto.
# Uso (desde la raíz del proyecto): bash specdriven/instalar.sh
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
src="$root/specdriven/claude"

mkdir -p "$root/.claude/skills/specdriven" "$root/.claude/agents" \
  "$root/specdriven/backlog" "$root/specdriven/en-curso" \
  "$root/specdriven/terminados" "$root/specdriven/decisiones"
cp "$src/skills/specdriven/SKILL.md" "$root/.claude/skills/specdriven/SKILL.md"
cp "$src/agents/spec-verifier.md" "$root/.claude/agents/spec-verifier.md"

echo "specdriven instalado:"
echo "  .claude/skills/specdriven/SKILL.md"
echo "  .claude/agents/spec-verifier.md"
echo "Recuerda editar specdriven/config.md y enlazar el proceso desde CLAUDE.md."
