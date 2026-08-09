#!/usr/bin/env python3
"""Read-only UI kit scanner for frontend projects."""

from __future__ import annotations

import argparse
import json
import os
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


IGNORE_DIRS = {
    ".git",
    ".hg",
    ".svn",
    ".next",
    ".nuxt",
    ".output",
    ".turbo",
    ".vercel",
    ".cache",
    "node_modules",
    "dist",
    "build",
    "coverage",
    "out",
    "target",
    "__pycache__",
}

CODE_EXTS = {
    ".tsx",
    ".jsx",
    ".ts",
    ".js",
    ".mjs",
    ".cjs",
    ".vue",
    ".svelte",
    ".css",
    ".scss",
    ".sass",
    ".less",
    ".html",
}

PACKAGE_MANAGER_FILES = {
    "pnpm-lock.yaml": "pnpm",
    "yarn.lock": "yarn",
    "bun.lockb": "bun",
    "bun.lock": "bun",
    "package-lock.json": "npm",
}

PROVIDER_PATTERNS = {
    "Astryx": ["@astryxdesign/"],
    "shadcn": ["components.json"],
    "Tailwind CSS": ["tailwindcss", "tailwind.config", "@import \"tailwindcss\"", "@import 'tailwindcss'"],
    "Ant Design": ["antd"],
    "MUI": ["@mui/"],
    "Chakra UI": ["@chakra-ui/"],
    "Mantine": ["@mantine/"],
    "Radix UI": ["@radix-ui/"],
    "Base UI": ["@base-ui-components/", "base-ui"],
    "React Aria": ["react-aria", "@react-aria/"],
    "HeroUI/NextUI": ["@heroui/", "@nextui-org/"],
}

IMPORT_RE = re.compile(r"""from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)""")
CSS_VAR_RE = re.compile(r"--[a-zA-Z0-9_-]+\s*:")
REACT_EXPORT_RE = re.compile(r"\b(?:export\s+)?(?:function|const)\s+([A-Z][A-Za-z0-9_]*)\b")


def should_skip_dir(name: str) -> bool:
    return name in IGNORE_DIRS or name.startswith(".") and name not in {".storybook"}


def rel(path: Path, root: Path) -> str:
    try:
        return path.relative_to(root).as_posix()
    except ValueError:
        return path.as_posix()


def iter_files(root: Path, max_files: int) -> list[Path]:
    files: list[Path] = []
    for current, dirs, names in os.walk(root):
        dirs[:] = [d for d in dirs if not should_skip_dir(d)]
        for name in names:
            path = Path(current) / name
            if len(files) >= max_files:
                return files
            if path.suffix in CODE_EXTS or name in PACKAGE_MANAGER_FILES or name in {"package.json", "components.json"}:
                files.append(path)
    return files


def read_text(path: Path, max_bytes: int = 256_000) -> str:
    try:
        data = path.read_bytes()[:max_bytes]
        return data.decode("utf-8", errors="ignore")
    except OSError:
        return ""


def load_package_jsons(root: Path, files: list[Path]) -> list[dict[str, Any]]:
    packages = []
    for path in files:
        if path.name != "package.json":
            continue
        try:
            package = json.loads(read_text(path))
        except json.JSONDecodeError:
            continue
        deps: dict[str, str] = {}
        for key in ("dependencies", "devDependencies", "peerDependencies"):
            value = package.get(key)
            if isinstance(value, dict):
                deps.update({str(k): str(v) for k, v in value.items()})
        packages.append(
            {
                "path": rel(path, root),
                "name": package.get("name"),
                "scripts": sorted((package.get("scripts") or {}).keys()),
                "dependencies": deps,
            }
        )
    return packages


def detect_package_manager(root: Path) -> str | None:
    for filename, manager in PACKAGE_MANAGER_FILES.items():
        if (root / filename).exists():
            return manager
    return None


def collect_imports(root: Path, files: list[Path], max_code_files: int) -> Counter[str]:
    imports: Counter[str] = Counter()
    seen = 0
    for path in files:
        if path.suffix not in {".tsx", ".jsx", ".ts", ".js", ".mjs", ".cjs", ".vue", ".svelte"}:
            continue
        seen += 1
        if seen > max_code_files:
            break
        text = read_text(path, 96_000)
        for match in IMPORT_RE.finditer(text):
            module = match.group(1) or match.group(2)
            if not module or module.startswith("."):
                continue
            imports[module] += 1
    return imports


def provider_evidence(root: Path, files: list[Path], packages: list[dict[str, Any]], imports: Counter[str]) -> dict[str, list[str]]:
    evidence: dict[str, list[str]] = defaultdict(list)
    dep_names = sorted({dep for package in packages for dep in package["dependencies"]})
    file_names = {path.name for path in files}
    rel_files = [rel(path, root) for path in files]

    for provider, patterns in PROVIDER_PATTERNS.items():
        for pattern in patterns:
            if pattern == "components.json" and "components.json" in file_names:
                evidence[provider].append("components.json present")
                continue
            for dep in dep_names:
                if dep == pattern or dep.startswith(pattern):
                    evidence[provider].append(f"dependency: {dep}")
            for module, count in imports.items():
                if module == pattern or module.startswith(pattern):
                    evidence[provider].append(f"import: {module} ({count})")
            for path in rel_files:
                if pattern in path:
                    evidence[provider].append(f"file: {path}")

    return {k: sorted(set(v))[:12] for k, v in sorted(evidence.items()) if v}


def find_component_dirs(root: Path, files: list[Path]) -> list[str]:
    candidates: Counter[str] = Counter()
    for path in files:
        parts = path.relative_to(root).parts if path.is_relative_to(root) else path.parts
        lowered = [p.lower() for p in parts]
        for marker in ("components", "ui", "widgets"):
            if marker in lowered:
                idx = lowered.index(marker)
                if idx < len(parts) - 1:
                    candidates["/".join(parts[: idx + 1])] += 1
    return [name for name, _ in candidates.most_common(20)]


def find_route_files(root: Path, files: list[Path]) -> list[str]:
    routes = []
    for path in files:
        r = rel(path, root)
        parts = r.split("/")
        if path.name in {"page.tsx", "page.jsx", "page.ts", "page.js", "route.ts", "route.js"}:
            routes.append(r)
        elif parts and parts[0] in {"pages", "app", "routes"} and path.suffix in {".tsx", ".jsx", ".ts", ".js", ".vue", ".svelte"}:
            routes.append(r)
    return sorted(set(routes))[:80]


def find_theme_files(root: Path, files: list[Path]) -> list[dict[str, Any]]:
    result = []
    theme_name_re = re.compile(r"(theme|token|global|style|tailwind|variables|colors)", re.IGNORECASE)
    for path in files:
        r = rel(path, root)
        if path.name == "components.json" or theme_name_re.search(path.name):
            text = read_text(path, 160_000)
            vars_found = sorted(set(match.group(0).split(":")[0] for match in CSS_VAR_RE.finditer(text)))[:30]
            result.append({"path": r, "cssVariables": vars_found})
        elif path.suffix in {".css", ".scss", ".sass", ".less"}:
            text = read_text(path, 160_000)
            if "@theme" in text or CSS_VAR_RE.search(text):
                vars_found = sorted(set(match.group(0).split(":")[0] for match in CSS_VAR_RE.finditer(text)))[:30]
                result.append({"path": r, "cssVariables": vars_found})
    return result[:60]


def component_name_hints(root: Path, files: list[Path], max_code_files: int) -> dict[str, Any]:
    basenames: Counter[str] = Counter()
    exports: Counter[str] = Counter()
    by_basename: dict[str, list[str]] = defaultdict(list)
    common_names = {
        "Button",
        "Card",
        "Dialog",
        "Drawer",
        "Modal",
        "Table",
        "DataTable",
        "Form",
        "Input",
        "Select",
        "Badge",
        "StatusBadge",
        "PageHeader",
        "Sidebar",
        "AppShell",
        "EmptyState",
        "FilterBar",
    }

    seen = 0
    for path in files:
        if path.suffix not in {".tsx", ".jsx", ".ts", ".js", ".vue", ".svelte"}:
            continue
        seen += 1
        if seen > max_code_files:
            break
        name = path.stem
        basenames[name] += 1
        by_basename[name].append(rel(path, root))
        text = read_text(path, 96_000)
        for match in REACT_EXPORT_RE.finditer(text):
            exports[match.group(1)] += 1

    duplicate_files = {
        name: paths[:12]
        for name, paths in sorted(by_basename.items())
        if len(paths) > 1 and name not in {"index", "types", "utils"}
    }
    common_present = sorted(
        set(common_names).intersection(basenames.keys()).union(set(common_names).intersection(exports.keys()))
    )
    return {
        "commonComponentNamesPresent": common_present,
        "duplicateFileBasenames": dict(list(duplicate_files.items())[:40]),
        "topExportedComponents": exports.most_common(40),
    }


def build_report(root: Path, max_files: int, max_code_files: int) -> dict[str, Any]:
    files = iter_files(root, max_files)
    packages = load_package_jsons(root, files)
    imports = collect_imports(root, files, max_code_files)
    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "project": str(root),
        "fileCountScanned": len(files),
        "packageManager": detect_package_manager(root),
        "packages": packages,
        "providerEvidence": provider_evidence(root, files, packages, imports),
        "componentDirectories": find_component_dirs(root, files),
        "routeFiles": find_route_files(root, files),
        "themeFiles": find_theme_files(root, files),
        "componentHints": component_name_hints(root, files, max_code_files),
        "topImports": imports.most_common(60),
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# UI Kit Scan Report",
        "",
        f"- Project: `{report['project']}`",
        f"- Generated: `{report['generatedAt']}`",
        f"- Files scanned: `{report['fileCountScanned']}`",
        f"- Package manager: `{report.get('packageManager') or 'unknown'}`",
        "",
        "## Provider Evidence",
        "",
    ]

    provider_evidence_map = report["providerEvidence"]
    if provider_evidence_map:
        for provider, evidence in provider_evidence_map.items():
            lines.append(f"### {provider}")
            for item in evidence:
                lines.append(f"- {item}")
            lines.append("")
    else:
        lines.extend(["No obvious provider evidence found.", ""])

    lines.extend(["## Packages", ""])
    for package in report["packages"][:12]:
        deps = ", ".join(sorted(package["dependencies"].keys())[:30])
        lines.append(f"- `{package['path']}`: {package.get('name') or '(unnamed)'}")
        if deps:
            lines.append(f"  Dependencies: {deps}")
    if not report["packages"]:
        lines.append("No package.json files found.")
    lines.append("")

    lines.extend(["## Component Directories", ""])
    if report["componentDirectories"]:
        for path in report["componentDirectories"]:
            lines.append(f"- `{path}`")
    else:
        lines.append("No obvious component directories found.")
    lines.append("")

    lines.extend(["## Route Files", ""])
    for path in report["routeFiles"][:50]:
        lines.append(f"- `{path}`")
    if len(report["routeFiles"]) > 50:
        lines.append(f"- ... {len(report['routeFiles']) - 50} more")
    if not report["routeFiles"]:
        lines.append("No obvious route files found.")
    lines.append("")

    lines.extend(["## Theme And Token Files", ""])
    if report["themeFiles"]:
        for item in report["themeFiles"][:30]:
            variables = ", ".join(item["cssVariables"][:12])
            suffix = f" - variables: {variables}" if variables else ""
            lines.append(f"- `{item['path']}`{suffix}")
    else:
        lines.append("No obvious theme or token files found.")
    lines.append("")

    hints = report["componentHints"]
    lines.extend(["## Component Hints", ""])
    common = hints["commonComponentNamesPresent"]
    lines.append("Common names present: " + (", ".join(common) if common else "none detected"))
    lines.append("")
    duplicates = hints["duplicateFileBasenames"]
    if duplicates:
        lines.append("Duplicate file basenames:")
        for name, paths in list(duplicates.items())[:20]:
            lines.append(f"- `{name}`: " + ", ".join(f"`{p}`" for p in paths[:6]))
    else:
        lines.append("No duplicate component basenames detected.")
    lines.append("")

    lines.extend(
        [
            "## Recommended Next Inspection",
            "",
            "- Read representative layout, route, form, table, dialog, and status components.",
            "- Confirm whether provider evidence reflects real usage or stale dependencies.",
            "- Document reusable components in the project's UI maintenance doc.",
            "- Document repeated page patterns in the project's UI maintenance doc.",
            "- Keep existing projects in audit-only mode unless code changes are explicitly approved.",
        ]
    )
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Scan a frontend project for UI kit evidence.")
    parser.add_argument("--project", default=".", help="Project directory to scan.")
    parser.add_argument("--out", help="Write report to this path. Defaults to stdout.")
    parser.add_argument("--json", action="store_true", help="Emit JSON instead of Markdown.")
    parser.add_argument("--max-files", type=int, default=5000, help="Maximum relevant files to scan.")
    parser.add_argument("--max-code-files", type=int, default=1500, help="Maximum code files to inspect for imports/exports.")
    args = parser.parse_args()

    root = Path(args.project).expanduser().resolve()
    if not root.exists() or not root.is_dir():
        raise SystemExit(f"Project directory does not exist: {root}")

    report = build_report(root, args.max_files, args.max_code_files)
    output = json.dumps(report, indent=2, ensure_ascii=False) + "\n" if args.json else render_markdown(report)

    if args.out:
        out_path = Path(args.out).expanduser()
        if not out_path.is_absolute():
            out_path = (Path.cwd() / out_path).resolve()
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(output, encoding="utf-8")
    else:
        print(output, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
