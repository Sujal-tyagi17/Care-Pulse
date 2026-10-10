import { ethers, network, artifacts } from "hardhat";
import fs from "fs";
import path from "path";

/**
 * Deploys MedicalRegistry with the deployer (BLOCKCHAIN_RELAYER_PRIVATE_KEY) as hospital owner,
 * then writes the address + ABI where the server and client read them.
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  const { chainId } = await ethers.provider.getNetwork();
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log(`Network:  ${network.name} (chainId ${chainId})`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance:  ${ethers.formatEther(balance)}`);

  const Registry = await ethers.getContractFactory("MedicalRegistry");
  const registry = await Registry.deploy(deployer.address);
  await registry.waitForDeployment();
  const address = await registry.getAddress();
  const deployTx = registry.deploymentTransaction();
  const receipt = deployTx ? await deployTx.wait() : null;

  console.log(`\nMedicalRegistry deployed at ${address}`);

  const deployment = {
    network: network.name,
    chainId: Number(chainId),
    address,
    owner: deployer.address,
    deployedAt: new Date().toISOString(),
    blockNumber: receipt?.blockNumber ?? null,
    txHash: deployTx?.hash ?? null,
  };

  const root = path.resolve(__dirname, "..");
  fs.mkdirSync(path.join(root, "deployments"), { recursive: true });
  fs.writeFileSync(path.join(root, "deployments", `${network.name}.json`), JSON.stringify(deployment, null, 2));

  await exportAbi();

  console.log(`\nAdd these to your .env files:`);
  console.log(`  server/.env  ->  BLOCKCHAIN_RPC_URL=${(network.config as { url?: string }).url ?? "http://127.0.0.1:8545"}`);
  console.log(`                   BLOCKCHAIN_REGISTRY_ADDRESS=${address}`);
  console.log(`                   BLOCKCHAIN_CHAIN_ID=${chainId}`);
  console.log(
    `                   BLOCKCHAIN_RELAYER_PRIVATE_KEY=${
      network.name === "localhost"
        ? "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80   (Hardhat account #0, local only)"
        : "<the deployer key: it owns the contract>"
    }`
  );
  console.log(`                   BLOCKCHAIN_DOCTOR_KEY_SECRET=<any long random string>`);
  console.log(`  client/.env  ->  VITE_BLOCKCHAIN_RPC_URL=<same public RPC>`);
  console.log(`                   VITE_BLOCKCHAIN_REGISTRY_ADDRESS=${address}`);
  console.log(`                   VITE_BLOCKCHAIN_CHAIN_ID=${chainId}`);
}

export async function exportAbi() {
  const artifact = await artifacts.readArtifact("MedicalRegistry");
  const targets = [
    path.resolve(__dirname, "../../server/src/blockchain/MedicalRegistry.abi.json"),
    path.resolve(__dirname, "../../client/src/blockchain/MedicalRegistry.abi.json"),
  ];
  for (const t of targets) {
    fs.mkdirSync(path.dirname(t), { recursive: true });
    fs.writeFileSync(t, JSON.stringify(artifact.abi, null, 2) + "\n");
    console.log(`ABI written to ${path.relative(path.resolve(__dirname, "../.."), t)}`);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
