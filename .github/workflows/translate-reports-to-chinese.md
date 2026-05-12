---
name: Translate reports to Chinese
description: |
  Translate English Markdown reports from `vibewatch/harvester` into Simplified
  Chinese, then sync generated `.zh.md` files back to the harvester and website
  repositories.

on:
  # schedule: # Disabled: Cloudflare Worker handles scheduling
  #   - cron: '0 4 * * *'
  workflow_dispatch:
    inputs:
      model:
        description: Copilot model to use for translation.
        required: false
        type: choice
        default: gpt-5.4
        options:
          - claude-opus-4.6
          - claude-sonnet-4.6
          - gpt-5.4
          - gpt-5.5

permissions:
  contents: read

concurrency:
  group: ${{ github.workflow }}
  cancel-in-progress: false

strict: true

engine:
  id: copilot
  model: ${{ inputs.model || 'gpt-5.4' }}
  max-continuations: 6

timeout-minutes: 120

network:
  allowed:
    - defaults
    - github

tools:
  edit:
  bash: ["*"]

checkout:
  - repository: vibewatch/harvester
    path: harvester
    fetch-depth: 0
    github-token: ${{ secrets.HARVESTER_PAT }}
  - path: website
    fetch-depth: 0
    github-token: ${{ secrets.WEBSITE_PAT }}

post-steps:
  - name: Commit and push generated Chinese translations
    shell: bash
    env:
      HARVESTER_PAT: ${{ secrets.HARVESTER_PAT }}
      WEBSITE_PAT: ${{ secrets.WEBSITE_PAT }}
      HARVESTER_REPO: vibewatch/harvester
      WEBSITE_REPO: ${{ github.repository }}
    run: |
      set -euo pipefail

      configure_remote() {
        local repo_dir="$1"
        local token="$2"
        local repo="$3"
        git -C "$repo_dir" remote set-url origin "https://x-access-token:${token}@github.com/${repo}.git"
      }

      push_with_rebase_retry() {
        local repo_dir="$1"
        local branch="${2:-main}"
        for attempt in 1 2 3 4 5; do
          git -C "$repo_dir" fetch origin "$branch"
          git -C "$repo_dir" rebase "origin/$branch"
          if git -C "$repo_dir" push origin "HEAD:$branch"; then
            return 0
          fi
          echo "Push failed on attempt ${attempt}; retrying after rebasing latest origin/${branch}..."
        done
        echo "Unable to push ${repo_dir} after 5 attempts."
        return 1
      }

      has_translation_changes() {
        local unstaged committed
        unstaged=$(git -C harvester status --porcelain -- reports/ | awk '$2 ~ /^reports\/.*\.zh\.md$/ { print }' || true)
        committed=$(git -C harvester diff --name-only origin/main..HEAD -- reports/ 2>/dev/null | grep '\.zh\.md$' || true)
        [[ -n "$unstaged" || -n "$committed" ]]
      }

      assert_only_translation_changes() {
        local unexpected_status unexpected_commits
        unexpected_status=$(git -C harvester status --porcelain | awk '$2 !~ /^reports\/.*\.zh\.md$/ { print }' || true)
        unexpected_commits=$(git -C harvester diff --name-only origin/main..HEAD 2>/dev/null | grep -v '^reports/.*\.zh\.md$' || true)

        if [[ -n "$unexpected_status" || -n "$unexpected_commits" ]]; then
          echo "::error::The agent changed files outside reports/**/*.zh.md in harvester. Refusing to push."
          if [[ -n "$unexpected_status" ]]; then
            echo "Unexpected working tree changes:"
            echo "$unexpected_status"
          fi
          if [[ -n "$unexpected_commits" ]]; then
            echo "Unexpected committed changes:"
            echo "$unexpected_commits"
          fi
          exit 1
        fi
      }

      git config --global user.name "github-actions[bot]"
      git config --global user.email "github-actions[bot]@users.noreply.github.com"

      git -C harvester fetch origin main
      assert_only_translation_changes

      if ! has_translation_changes; then
        echo "No new Chinese translations were generated."
        exit 0
      fi

      configure_remote harvester "$HARVESTER_PAT" "$HARVESTER_REPO"
      git -C harvester add 'reports/**/*.zh.md'
      if git -C harvester diff --cached --quiet; then
        echo "No staged harvester translations to commit; changes may already be committed."
      else
        git -C harvester commit -m "Add Chinese translations for $(date -u +%Y-%m-%d)"
      fi
      push_with_rebase_retry harvester main

      # Discard any accidental website edits from the agent, then perform the
      # deterministic harvester -> website docs sync.
      git -C website reset --hard HEAD
      git -C website clean -fd
      rsync -av --include='*/' --include='*.zh.md' --exclude='*' harvester/reports/ website/docs/

      configure_remote website "$WEBSITE_PAT" "$WEBSITE_REPO"
      git -C website add docs/
      if git -C website diff --cached --quiet; then
        echo "No new website translations to push."
      else
        git -C website commit -m "Add Chinese translations for $(date -u +%Y-%m-%d)"
        push_with_rebase_retry website main
      fi
---

# Translate reports to Chinese

Translate every English Markdown report in `harvester/reports/` that does not yet have a Simplified Chinese companion file.

## Repository layout

- `harvester/` is the `vibewatch/harvester` checkout.
- `website/` is the website repository checkout used by the deterministic post-step sync.
- English reports live under `harvester/reports/<source>/<topic>/YYYY-MM-DD.md`.
- Chinese translations must be written alongside the English report as `YYYY-MM-DD.zh.md`.

## Translation task

1. Find every English report matching `harvester/reports/**/*.md` that is missing its matching `.zh.md` file.
2. Translate the full report into natural, publication-quality Simplified Chinese.
3. Preserve all Markdown structure exactly enough for the site to render correctly:
   - Keep headings, lists, tables, horizontal rules, image syntax, links, URLs, and inline code intact.
   - Translate visible English prose, table headings, and table cell text.
   - Do not translate URLs, file paths, dates, numeric metrics, code identifiers, or source titles inside link/image targets.
   - Keep the existing emoji and trend arrows such as `🡒`, `🡕`, and `🡗`.
4. Write only the missing `harvester/reports/**/*.zh.md` files.
5. Do not edit English `.md` files, website files, workflow files, or generated lock files.
6. Do not run `git add`, `git commit`, or `git push`; the post-step handles all commits and synchronization.

## Agentic execution guidance

- You may split translation work across concurrent write-enabled subagents by source/topic or by file batch.
- Ensure each subagent writes only its assigned missing `.zh.md` files to avoid conflicting edits.
- Wait for all translation work to finish before exiting.
- If there are no missing translations, report that no files needed work and exit successfully.
- If a report cannot be translated safely, stop and explain the specific file and reason instead of producing a partial translation.

## Quality bar

- The Chinese should read like an original editorial report, not a literal machine translation.
- Keep analysis precise and preserve the meaning, evidence, and source attribution from the English report.
- Use consistent terminology across reports: “AI 智能体” for AI agents, “AI 编程” for AI coding, “具身智能” for physical/embodied AI when appropriate, and “工作流” for workflow.