import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { requireModule } from '../middleware/moduleMiddleware.js';
import { roleMiddleware } from '../middleware/roleMiddleware.js';
import { User } from '../models/User.js';
import { RealtimeService } from '../modules/realtime/RealtimeService.js';
import { teamMemberIds } from '../utils/crmScope.js';

const router = Router();

router.get(
  '/events',
  authMiddleware,
  roleMiddleware('ADMIN', 'SUPERVISOR', 'CALLCENTER'),
  requireModule('conversations'),
  requireModule('inbox'),
  requireModule('realtime'),
  async (req, res, next) => {
    try {
      if (process.env.REALTIME_ENABLED === 'false') {
        return res.status(503).json({ message: 'Realtime esta desactivado' });
      }
      const id = randomUUID();
      const allowedAssignedIds =
        req.user.role === 'ADMIN'
          ? []
          : req.user.role === 'SUPERVISOR'
            ? await teamMemberIds(req.user)
            : [req.user._id];
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no'
      });
      res.write(`event: connected\ndata: ${JSON.stringify({ connected: true })}\n\n`);
      RealtimeService.addClient({
        id,
        response: res,
        user: req.user,
        allowedAssignedIds
      });

      const heartbeat = setInterval(async () => {
        const active = await User.exists({ _id: req.user._id, status: 'active' }).catch(
          () => false
        );
        if (!active) {
          clearInterval(heartbeat);
          RealtimeService.removeClient(id);
          return res.end();
        }
        res.write(`: heartbeat ${Date.now()}\n\n`);
      }, 25000);

      req.on('close', () => {
        clearInterval(heartbeat);
        RealtimeService.removeClient(id);
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
