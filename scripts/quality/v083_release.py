"""Exact release coordinates shared by active source and package gates."""
from pathlib import Path
import importlib.util
import json
import tomllib

VERSION = "0.8.3"
MSI_VERSION = "0.8.300"
RPM_VERSION = "0.8.3"
RPM_RELEASE = "1"
IDENTIFIER = "com.thecreativesolver.TCSMail"
TAURI_CLI_VERSION = "2.12.4"
HOMEPAGE = "https://thecreativesolver.com/tcsmail/"


def check_versions(root: Path):
    config = json.loads((root / "src-tauri/tauri.conf.json").read_text(encoding="utf-8"))
    if config["version"] != VERSION or config["identifier"] != IDENTIFIER:
        raise ValueError("Public version or persisted application identifier changed")
    if config.get("bundle", {}).get("homepage") != HOMEPAGE:
        raise ValueError("Release homepage mismatch")
    if config["bundle"]["linux"]["rpm"].get("release") != RPM_RELEASE:
        raise ValueError("Configured RPM release mismatch")
    if config["productName"] != "TCS Mail":
        raise ValueError("Product name changed")
    if config["bundle"]["windows"]["wix"]["version"] != MSI_VERSION:
        raise ValueError("MSI version mismatch")
    packages = ("tcs-core", "tcs-ai-core", "tcs-mail")
    for name, relative in zip(packages, ("crates/tcs-core", "crates/tcs-ai-core", "src-tauri")):
        data = tomllib.loads((root / relative / "Cargo.toml").read_text(encoding="utf-8"))
        if (data["package"]["name"], data["package"]["version"]) != (name, VERSION):
            raise ValueError(f"Wrong package/version: {relative}/Cargo.toml")
    lock = tomllib.loads((root / "Cargo.lock").read_text(encoding="utf-8"))
    for name in packages:
        versions = [item["version"] for item in lock["package"] if item["name"] == name]
        if versions != [VERSION]:
            raise ValueError(f"Cargo.lock mismatch: {name}: {versions}")
    return config


def pipeline_contract(root: Path):
    """Inspect the actual command plan delegated to by the active workflow."""
    workflow = (root / ".github/workflows/tcsmail-homologacao.yml").read_text(encoding="utf-8")
    if "run: python scripts/build-0.8.3.py --target" not in workflow:
        raise ValueError("Active native workflow does not run the complete orchestrator")
    spec = importlib.util.spec_from_file_location("v083_build_contract", root / "scripts/build-0.8.3.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    commands = module.source_commands() + module.rust_commands("x86_64-unknown-linux-gnu")
    commands += module.bundle_commands("linux", "x86_64-unknown-linux-gnu")
    commands += [["python", "scripts/quality/tcsmail-package-guard.py", "--bundles"]]
    return workflow + "\n" + "\n".join(" ".join(cmd) for cmd in commands)
