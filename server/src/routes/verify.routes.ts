import { Router } from 'express';
import { getChain, verifyRecordHash } from '../services/blockchain.service.js';

/**
 * Public, unauthenticated verification endpoints — used by pharmacies, insurers or anyone
 * scanning a prescription QR code. The client also re-checks the chain directly, so a
 * dishonest server could not fake a "VALID" result.
 */
const router = Router();

router.get('/config', (_req, res) => {
  const chain = getChain();
  res.json({
    success: true,
    enabled: !!chain,
    chainId: chain?.config.chainId ?? null,
    contractAddress: chain?.config.contractAddress ?? null,
    explorerUrl: chain?.config.explorerUrl ?? null
  });
});

router.get('/:recordHash', async (req, res) => {
  try {
    const result = await verifyRecordHash(req.params.recordHash);
    res.set('Cache-Control', 'no-store');
    return res.json({ success: true, ...result });
  } catch (err: any) {
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
});

export default router;
