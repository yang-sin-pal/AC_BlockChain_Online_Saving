import fs from "fs";

interface ContractDef {
  name: string;
  path: string;
}

const CONTRACTS: ContractDef[] = [
  { name: "SavingCore", path: "contracts/core/SavingCore.sol/SavingCore.json" },
  { name: "VaultManager", path: "contracts/core/VaultManager.sol/VaultManager.json" },
  { name: "MockUSDC", path: "contracts/mocks/MockUSDC.sol/MockUSDC.json" },
];

const ABI_DIR = "frontend/src/abi";

export function main(): void {
  fs.mkdirSync(ABI_DIR, { recursive: true });

  const results: string[] = [];
  for (const { name, path } of CONTRACTS) {
    const artifactPath = `artifacts/${path}`;
    if (!fs.existsSync(artifactPath)) {
      results.push(`  ⚠ ${name} — artifact not found at ${artifactPath}`);
      continue;
    }
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    const abi = artifact.abi;
    const outPath = `${ABI_DIR}/${name}.json`;
    fs.writeFileSync(outPath, JSON.stringify(abi, null, 2));
    results.push(`  ✓ ${name}.json (${abi.length} entries)`);
  }
  console.log("[copy-abis] Frontend ABIs synced to frontend/src/abi/:");
  for (const r of results) console.log(r);
}
