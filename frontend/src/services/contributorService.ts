import { api } from './api';
import type { Contributor } from '../types';

export const contributorService = {
  list: (repositoryId: string) =>
    api.get<Contributor[]>(`/api/repositories/${repositoryId}/contributors`),
};
