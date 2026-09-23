#!/usr/bin/env bash
set -euo pipefail

base_ref="${BASE_REF:-main}"
base="${BASE_SHA:-origin/${base_ref}}"
head="${HEAD_SHA:-HEAD}"
range="${base}...${head}"

changed_files=()
while IFS= read -r line; do
  [ -n "$line" ] && changed_files+=("$line")
done < <(git diff --name-only "$range")

has_changeset=false
has_package_change=false
has_package_source_change=false
major_changeset_without_migration_note=false

changeset_has_major_bump() {
  local file="$1"
  awk '
    BEGIN { in_frontmatter = 0; saw_frontmatter = 0 }
    /^---[[:space:]]*$/ { in_frontmatter = !in_frontmatter; saw_frontmatter = 1; next }
    in_frontmatter && $0 ~ /:[[:space:]]*major[[:space:]]*$/ { found = 1 }
    END { exit found ? 0 : 1 }
  ' "$file"
}

changeset_has_migration_note() {
  local file="$1"
  grep -Eq '^Migration note:[[:space:]]*[^[:space:]].*$' "$file"
}

for file in "${changed_files[@]}"; do
  if [[ "$file" =~ ^\.changeset/.+\.md$ ]]; then
    has_changeset=true
    if changeset_has_major_bump "$file" && ! changeset_has_migration_note "$file"; then
      echo "::error file=${file}::Major changesets must include a non-empty 'Migration note:' line so GitHub Releases and consumers surface migration guidance."
      major_changeset_without_migration_note=true
    fi
  fi

  if [[ "$file" == packages/* ]]; then
    has_package_change=true
    case "$file" in
      packages/*/package.json|packages/*/CHANGELOG.md)
        ;;
      *)
        has_package_source_change=true
        ;;
    esac
  fi
done

if [[ "$major_changeset_without_migration_note" == true ]]; then
  exit 1
fi

if [[ "$has_changeset" == true ]]; then
  echo "✓ changeset present"
  exit 0
fi

if [[ "$has_package_change" == false ]]; then
  echo "✓ no package changes detected"
  exit 0
fi

release_subject_found=false
while IFS= read -r subject; do
  if [[ "$subject" =~ ^chore\(release\):[[:space:]] ]]; then
    release_subject_found=true
    break
  fi
done < <(git log --format=%s "$range")

if [[ "$has_package_source_change" == false ]]; then
  if [[ "$release_subject_found" == true ]]; then
    echo "✓ release PR version bump detected (chore(release) with only package version/CHANGELOG changes)"
  else
    echo "✓ only package version/CHANGELOG changes detected; treating as release-version metadata"
  fi
  exit 0
fi

echo "::error::No changeset found. Run 'pnpm run changeset' to describe the change for release notes, or apply the 'no-release' label. Do NOT run 'pnpm run version-packages' in the same PR — that consumes the changeset file this gate looks for; versioning belongs in the release PR. Release PRs are exempt only when package changes are limited to package.json/CHANGELOG version metadata."
exit 1
