import { Request, Response, NextFunction } from 'express';
import { webhookService } from '../webhooks/webhookService.js';
import { sendSuccess } from '../utils/response.js';
import { runInBackground } from '../utils/background.js';

// Records and acknowledges the delivery immediately (GitHub expects a reply within
// 10 s), then processes it in the background; the outcome is stored on the event.
export async function receiveGitHubWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await webhookService.receive({
      event: req.get('x-github-event'),
      deliveryId: req.get('x-github-delivery'),
      signature: req.get('x-hub-signature-256'),
      contentType: req.get('content-type'),
      rawBody: Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0),
    });

    sendSuccess(res, { deliveryId: result.deliveryId, status: result.status }, result.status === 'accepted' ? 202 : 200);

    if (result.event) {
      runInBackground(
        webhookService.process(result.event).catch((err: Error) => console.error('[webhook] processing crashed:', err)),
      );
    }
  } catch (err) {
    next(err);
  }
}
