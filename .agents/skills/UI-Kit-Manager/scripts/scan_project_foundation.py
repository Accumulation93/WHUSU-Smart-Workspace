#!/usr/bin/env python3
"""Project foundation scanner for maintenance-index planning.

The default stdout mode is read-only. The optional --out flag writes only the
requested report file and should be used after document-output approval in
existing projects.
"""

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
    ".pytest_cache",
    ".mypy_cache",
    ".ruff_cache",
    "node_modules",
    "dist",
    "build",
    "coverage",
    "out",
    "target",
    "__pycache__",
    ".venv",
    "venv",
    "env",
}

TEXT_EXTS = {
    ".astro",
    ".css",
    ".go",
    ".html",
    ".java",
    ".js",
    ".jsx",
    ".kt",
    ".less",
    ".md",
    ".mjs",
    ".py",
    ".rs",
    ".sass",
    ".scss",
    ".svelte",
    ".toml",
    ".ts",
    ".tsx",
    ".vue",
    ".yaml",
    ".yml",
}

PACKAGE_MANAGER_FILES = {
    "pnpm-lock.yaml": "pnpm",
    "yarn.lock": "yarn",
    "bun.lockb": "bun",
    "bun.lock": "bun",
    "package-lock.json": "npm",
}

IMPORTANT_NAMES = {
    "package.json",
    "pyproject.toml",
    "requirements.txt",
    "poetry.lock",
    "uv.lock",
    "Pipfile",
    "go.mod",
    "Cargo.toml",
    "composer.json",
    "pom.xml",
    "build.gradle",
    "settings.gradle",
    "Dockerfile",
    "docker-compose.yml",
    "compose.yml",
    "compose.yaml",
    "vercel.json",
    "netlify.toml",
    "wrangler.toml",
    "render.yaml",
    "railway.json",
    "Procfile",
    "README.md",
    "SKILL.md",
    "AGENTS.md",
    "CLAUDE.md",
    "GEMINI.md",
    ".cursorrules",
    "components.json",
}

SOURCE_ROOT_NAMES = {
    "app",
    "apps",
    "api",
    "backend",
    "client",
    "components",
    "features",
    "frontend",
    "lib",
    "packages",
    "pages",
    "routes",
    "server",
    "services",
    "src",
    "tauri",
    "workers",
}

ENTRY_NAME_RE = re.compile(
    r"^(main|index|app|server|manage|worker|route|page)\.(tsx|jsx|ts|js|mjs|cjs|py|go|rs|java)$",
    re.IGNORECASE,
)
ENV_NAME_RE = re.compile(r"^\.env(?:\.|$)|.*\.env(?:\.example|\.sample|\.local)?$", re.IGNORECASE)
SECRET_NAME_RE = re.compile(
    r"(^|[-_.])(secret|secrets|credential|credentials|service-account|private-key|private_key|token|tokens|keyfile)([-_.]|$)|"
    r"(^id_rsa$|^id_dsa$|^id_ed25519$|\.pem$|\.key$|\.p12$|\.pfx$|\.npmrc$|\.netrc$)",
    re.IGNORECASE,
)
DOC_NAME_RE = re.compile(r"(readme|docs?|architecture|design|setup|deploy|api|schema|agent|claude|cursor|gemini|skill|reference|maintenance|index)", re.IGNORECASE)
DATA_HINT_RE = re.compile(r"(schema|model|models|migration|migrations|prisma|drizzle|database|db|entity|entities|repository|repositories)", re.IGNORECASE)
INTEGRATION_HINT_RE = re.compile(r"(api|client|sdk|webhook|ipc|trpc|openapi|graphql|queue|worker|payment|stripe|wechat|lark|feishu|openai|map|mail)", re.IGNORECASE)
IMPORT_RE = re.compile(r"""from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)""")

UI_PROVIDER_PATTERNS = {
    "Astryx": ["@astryxdesign/"],
    "shadcn": ["components.json"],
    "Tailwind CSS": ["tailwindcss", "tailwind.config", "@tailwindcss/"],
    "Ant Design": ["antd"],
    "MUI": ["@mui/"],
    "Chakra UI": ["@chakra-ui/"],
    "Mantine": ["@mantine/"],
    "Radix UI": ["@radix-ui/"],
    "Base UI": ["@base-ui-components/", "base-ui"],
    "React Aria": ["react-aria", "@react-aria/"],
    "HeroUI/NextUI": ["@heroui/", "@nextui-org/"],
}


def should_skip_dir(name: str) -> bool:
    return name in IGNORE_DIRS or (name.startswith(".") and name not in {".github", ".storybook"})


def rel(path: Path, root: Path) -> str:
    try:
        return path.relative_to(root).as_posix()
    except ValueError:
        return path.as_posix()


def iter_relevant_files(root: Path, max_files: int) -> list[Path]:
    files: list[Path] = []
    for current, dirs, names in os.walk(root):
        dirs[:] = [d for d in dirs if not should_skip_dir(d)]
        for name in names:
            path = Path(current) / name
            if len(files) >= max_files:
                return files
            if (
                name in IMPORTANT_NAMES
                or name in PACKAGE_MANAGER_FILES
                or path.suffix in TEXT_EXTS
                or ENV_NAME_RE.match(name)
                or SECRET_NAME_RE.search(name)
            ):
                files.append(path)
    return files


def read_text(path: Path, max_bytes: int = 128_000) -> str:
    if SECRET_NAME_RE.search(path.name):
        return ""
    if ENV_NAME_RE.match(path.name) and path.name not in {".env.example", ".env.sample"}:
        return ""
    try:
        data = path.read_bytes()[:max_bytes]
        return data.decode("utf-8", errors="ignore")
    except OSError:
        return ""


def detect_package_manager(root: Path) -> str | None:
    for filename, manager in PACKAGE_MANAGER_FILES.items():
        if (root / filename).exists():
            return manager
    return None


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
                "scripts": package.get("scripts") or {},
                "dependencies": deps,
            }
        )
    return packages


def collect_imports(root: Path, files: list[Path], max_code_files: int) -> Counter[str]:
    imports: Counter[str] = Counter()
    seen = 0
    for path in files:
        if path.suffix not in {".tsx", ".jsx", ".ts", ".js", ".mjs", ".cjs", ".vue", ".svelte", ".py"}:
            continue
        seen += 1
        if seen > max_code_files:
            break
        text = read_text(path, 96_000)
        for match in IMPORT_RE.finditer(text):
            module = next((group for group in match.groups() if group), None)
            if not module or module.startswith("."):
                continue
            imports[module] += 1
    return imports


def detect_stack(root: Path, files: list[Path], packages: list[dict[str, Any]]) -> dict[str, list[str]]:
    evidence: dict[str, list[str]] = defaultdict(list)
    names = {path.name for path in files}
    rel_paths = {rel(path, root) for path in files}
    deps = {dep for package in packages for dep in package["dependencies"]}

    checks = {
        "React": ["react"],
        "Next.js": ["next"],
        "Vite": ["vite"],
        "Vue": ["vue"],
        "Nuxt": ["nuxt"],
        "Svelte/SvelteKit": ["svelte", "@sveltejs/kit"],
        "Astro": ["astro"],
        "Electron": ["electron"],
        "Tauri": ["@tauri-apps/api", "tauri.conf.json"],
        "Express": ["express"],
        "Fastify": ["fastify"],
        "NestJS": ["@nestjs/"],
        "Python": ["pyproject.toml", "requirements.txt", "main.py", "app.py"],
        "FastAPI": ["fastapi"],
        "Django": ["django", "manage.py"],
        "Flask": ["flask"],
        "Go": ["go.mod"],
        "Rust": ["Cargo.toml"],
        "Docker": ["Dockerfile", "docker-compose.yml", "compose.yml", "compose.yaml"],
    }

    for stack, patterns in checks.items():
        for pattern in patterns:
            if pattern in names:
                evidence[stack].append(f"file: {pattern}")
            for dep in deps:
                if dep == pattern or dep.startswith(pattern):
                    evidence[stack].append(f"dependency: {dep}")
            for path in rel_paths:
                if path.endswith(pattern) or pattern in path:
                    if pattern in {"main.py", "app.py", "manage.py", "tauri.conf.json"}:
                        evidence[stack].append(f"file: {path}")

    return {key: sorted(set(value))[:12] for key, value in sorted(evidence.items()) if value}


def detect_ui_providers(root: Path, files: list[Path], packages: list[dict[str, Any]], imports: Counter[str]) -> dict[str, list[str]]:
    evidence: dict[str, list[str]] = defaultdict(list)
    names = {path.name for path in files}
    rel_paths = [rel(path, root) for path in files]
    deps = {dep for package in packages for dep in package["dependencies"]}

    for provider, patterns in UI_PROVIDER_PATTERNS.items():
        for pattern in patterns:
            if pattern == "components.json" and pattern in names:
                evidence[provider].append("components.json present")
            for dep in deps:
                if dep == pattern or dep.startswith(pattern):
                    evidence[provider].append(f"dependency: {dep}")
            for module, count in imports.items():
                if module == pattern or module.startswith(pattern):
                    evidence[provider].append(f"import: {module} ({count})")
            for path in rel_paths:
                if pattern in path:
                    evidence[provider].append(f"file: {path}")

    return {key: sorted(set(value))[:12] for key, value in sorted(evidence.items()) if value}


def source_roots(root: Path, files: list[Path]) -> list[dict[str, Any]]:
    counts: Counter[str] = Counter()
    for path in files:
        try:
            parts = path.relative_to(root).parts
        except ValueError:
            continue
        if not parts:
            continue
        first = parts[0]
        if first in SOURCE_ROOT_NAMES:
            counts[first] += 1
        elif len(parts) > 1 and parts[1] in SOURCE_ROOT_NAMES:
            counts["/".join(parts[:2])] += 1
    return [{"path": path, "fileCount": count} for path, count in counts.most_common(30)]


def entry_points(root: Path, files: list[Path]) -> list[str]:
    candidates = []
    for path in files:
        r = rel(path, root)
        if ENTRY_NAME_RE.match(path.name):
            candidates.append(r)
        elif r in {
            "src/main.tsx",
            "src/main.jsx",
            "src/App.tsx",
            "src/App.jsx",
            "app/page.tsx",
            "pages/index.tsx",
            "pages/index.jsx",
            "main.py",
            "app.py",
            "manage.py",
            "cmd/server/main.go",
        }:
            candidates.append(r)
    return sorted(set(candidates))[:80]


def route_files(root: Path, files: list[Path]) -> list[str]:
    routes = []
    for path in files:
        r = rel(path, root)
        parts = r.split("/")
        if path.name in {"page.tsx", "page.jsx", "page.ts", "page.js", "route.ts", "route.js", "+page.svelte", "+server.ts"}:
            routes.append(r)
        elif parts and parts[0] in {"pages", "app", "routes"} and path.suffix in {".tsx", ".jsx", ".ts", ".js", ".vue", ".svelte"}:
            routes.append(r)
    return sorted(set(routes))[:120]


def config_files(root: Path, files: list[Path]) -> list[str]:
    result = []
    for path in files:
        r = rel(path, root)
        if path.name in IMPORTANT_NAMES:
            result.append(r)
        elif ".github/workflows/" in r:
            result.append(r)
        elif path.name.startswith(("vite.config", "next.config", "nuxt.config", "svelte.config", "astro.config", "tailwind.config")):
            result.append(r)
    return sorted(set(result))[:120]


def env_files(root: Path, files: list[Path]) -> list[str]:
    return sorted(rel(path, root) for path in files if ENV_NAME_RE.match(path.name))[:80]


def secret_files(root: Path, files: list[Path]) -> list[str]:
    return sorted(rel(path, root) for path in files if SECRET_NAME_RE.search(path.name))[:80]


def docs_and_agent_files(root: Path, files: list[Path]) -> list[str]:
    result = []
    for path in files:
        r = rel(path, root)
        if path.suffix.lower() == ".md" and (
            DOC_NAME_RE.search(r)
            or r.startswith("docs/")
            or r.startswith("references/")
        ):
            result.append(r)
        elif r == "agents/openai.yaml":
            result.append(r)
        elif path.name in {"AGENTS.md", "CLAUDE.md", "GEMINI.md", ".cursorrules"}:
            result.append(r)
    return sorted(set(result))[:120]


def data_and_integration_hints(root: Path, files: list[Path]) -> dict[str, list[str]]:
    data = []
    integrations = []
    for path in files:
        r = rel(path, root)
        if DATA_HINT_RE.search(r):
            data.append(r)
        if INTEGRATION_HINT_RE.search(r):
            integrations.append(r)
    return {
        "dataHints": sorted(set(data))[:120],
        "integrationHints": sorted(set(integrations))[:120],
    }


def commands_from_packages(packages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    result = []
    for package in packages:
        scripts = package.get("scripts") or {}
        result.append(
            {
                "path": package["path"],
                "name": package.get("name"),
                "scripts": {key: scripts[key] for key in sorted(scripts)[:40]},
            }
        )
    return result


def build_report(root: Path, max_files: int, max_code_files: int) -> dict[str, Any]:
    files = iter_relevant_files(root, max_files)
    packages = load_package_jsons(root, files)
    imports = collect_imports(root, files, max_code_files)
    data_hints = data_and_integration_hints(root, files)
    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "project": str(root),
        "fileCountScanned": len(files),
        "gitRepository": (root / ".git").exists(),
        "packageManager": detect_package_manager(root),
        "stackEvidence": detect_stack(root, files, packages),
        "uiProviderEvidence": detect_ui_providers(root, files, packages, imports),
        "packages": commands_from_packages(packages),
        "sourceRoots": source_roots(root, files),
        "entryPoints": entry_points(root, files),
        "routeFiles": route_files(root, files),
        "configFiles": config_files(root, files),
        "envFiles": env_files(root, files),
        "secretFiles": secret_files(root, files),
        "docsAndAgentFiles": docs_and_agent_files(root, files),
        "dataHints": data_hints["dataHints"],
        "integrationHints": data_hints["integrationHints"],
        "topImports": imports.most_common(60),
        "notes": [
            "Default stdout scanning is read-only.",
            "The optional --out flag writes only the requested report file; use it after document-output approval in existing projects.",
            "Real environment and credential files are detected by name only; contents are not read.",
            "Treat findings as evidence to verify by reading representative files.",
        ],
    }


def add_list(lines: list[str], items: list[str], empty: str) -> None:
    if items:
        for item in items:
            lines.append(f"- `{item}`")
    else:
        lines.append(empty)
    lines.append("")


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Project Foundation Scan Report",
        "",
        f"- Project: `{report['project']}`",
        f"- Generated: `{report['generatedAt']}`",
        f"- Files scanned: `{report['fileCountScanned']}`",
        f"- Git repository: `{str(report['gitRepository']).lower()}`",
        f"- Package manager: `{report.get('packageManager') or 'unknown'}`",
        "",
        "## Stack Evidence",
        "",
    ]

    if report["stackEvidence"]:
        for stack, evidence in report["stackEvidence"].items():
            lines.append(f"### {stack}")
            for item in evidence:
                lines.append(f"- {item}")
            lines.append("")
    else:
        lines.append("No obvious stack evidence found.")
        lines.append("")

    lines.extend(["## Package Scripts", ""])
    if report["packages"]:
        for package in report["packages"][:12]:
            lines.append(f"### `{package['path']}`")
            if package.get("name"):
                lines.append(f"- Name: `{package['name']}`")
            scripts = package.get("scripts") or {}
            if scripts:
                for key, value in scripts.items():
                    lines.append(f"- `{key}`: `{value}`")
            else:
                lines.append("- No scripts found.")
            lines.append("")
    else:
        lines.append("No package.json files found.")
        lines.append("")

    lines.extend(["## Source Roots", ""])
    if report["sourceRoots"]:
        for item in report["sourceRoots"]:
            lines.append(f"- `{item['path']}` ({item['fileCount']} scanned files)")
    else:
        lines.append("No obvious source roots found.")
    lines.append("")

    lines.extend(["## Entry Points", ""])
    add_list(lines, report["entryPoints"], "No obvious entry points found.")

    lines.extend(["## Routes", ""])
    add_list(lines, report["routeFiles"][:80], "No obvious route files found.")

    lines.extend(["## Config And Deployment Files", ""])
    add_list(lines, report["configFiles"], "No obvious config/deployment files found.")

    lines.extend(["## Environment Files", ""])
    add_list(lines, report["envFiles"], "No environment files detected.")

    lines.extend(["## Credential-Like Files", ""])
    add_list(lines, report["secretFiles"], "No credential-like files detected.")

    lines.extend(["## Docs And Agent Files", ""])
    add_list(lines, report["docsAndAgentFiles"], "No obvious docs or agent files found.")

    lines.extend(["## Data Model Hints", ""])
    add_list(lines, report["dataHints"][:80], "No obvious data model hints found.")

    lines.extend(["## External/API/IPC Hints", ""])
    add_list(lines, report["integrationHints"][:80], "No obvious integration hints found.")

    lines.extend(["## UI Provider Evidence", ""])
    if report["uiProviderEvidence"]:
        for provider, evidence in report["uiProviderEvidence"].items():
            lines.append(f"### {provider}")
            for item in evidence:
                lines.append(f"- {item}")
            lines.append("")
    else:
        lines.append("No obvious UI provider evidence found.")
        lines.append("")

    lines.extend(
        [
            "## Recommended Next Step",
            "",
            "- Read representative files to verify the scan evidence.",
            "- Summarize project facts and unknowns before proposing edits.",
            "- Propose a maintenance-index document plan.",
            "- Wait for user approval before creating or updating docs.",
            "- Request separate explicit approval before any code/config/dependency/data/deployment change.",
            "",
            "## Scanner Notes",
            "",
        ]
    )
    for note in report["notes"]:
        lines.append(f"- {note}")
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Scan a project for foundation planning evidence.")
    parser.add_argument("--project", default=".", help="Project directory to scan.")
    parser.add_argument(
        "--out",
        help="Write report to this path. Defaults to stdout. Use after document-output approval in existing projects.",
    )
    parser.add_argument("--json", action="store_true", help="Emit JSON instead of Markdown.")
    parser.add_argument("--max-files", type=int, default=8000, help="Maximum relevant files to scan.")
    parser.add_argument("--max-code-files", type=int, default=2000, help="Maximum code files to inspect for imports.")
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
