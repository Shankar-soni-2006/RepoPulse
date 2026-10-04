import { Request, Response, NextFunction } from 'express';
import { contributorRepository } from '../repositories/contributorRepository.js';
import { sendSuccess } from '../utils/response.js';

export async function getContributors(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const contributors = await contributorRepository.findByRepository(req.params.repositoryId);
    sendSuccess(res, contributors);
  } catch (err) {
    next(err);
  }
}
