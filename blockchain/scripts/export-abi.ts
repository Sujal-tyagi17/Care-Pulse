import { exportAbi } from "./deploy";

exportAbi().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
