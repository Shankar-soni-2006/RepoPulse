import { installationRepository } from '../../repositories/installationRepository';
import { repositoryRepository } from '../../repositories/repositoryRepository';
import { accessRepository } from '../../repositories/accessRepository';
import type { DiscoveryResult } from '../../types';
import type { GHRepository } from './githubService';
import { normalizeRepository } from './normalizer';
import { createUserOctokit, toGitHubError } from './octokit';

/**
 * Discovers which installations and repositories the signed-in user can reach
 * through the RepoPulse GitHub App, stores their metadata, and replaces the
 * user's access rows to match GitHub exactly (revoking anything removed).
 *
 * Uses the user's token, so results reflect *this user's* permissions — an org
 * installation may expose only some repositories to a given member.
 */
export async function discoverForUser(userId: string, accessToken: string): Promise<DiscoveryResult> {
  const octokit = createUserOctokit(accessToken);

  let installations;
  try {
    installations = await octokit.paginate(octokit.apps.listInstallationsForAuthenticatedUser, {
      per_page: 100,
    });
  } catch (err) {
    throw toGitHubError(err, 'Failed to list GitHub App installations');
  }

  const installationIds: string[] = [];
  const repositoryIds: string[] = [];

  for (const inst of installations) {
    // Enterprise installations have no login/type; RepoPulse supports user and org accounts
    const account = inst.account;
    if (!account || !('login' in account)) continue;
    if (account.type !== 'User' && account.type !== 'Organization') continue;

    const installation = await installationRepository.upsert({
      installation_id: inst.id,
      app_id: inst.app_id,
      account_login: account.login,
      account_type: account.type,
    });
    installationIds.push(installation.id);

    let ghRepos: GHRepository[];
    try {
      ghRepos = (await octokit.paginate(octokit.apps.listInstallationReposForAuthenticatedUser, {
        installation_id: inst.id,
        per_page: 100,
      })) as GHRepository[];
    } catch (err) {
      throw toGitHubError(err, `Failed to list repositories for ${account.login}`);
    }

    const stored = await repositoryRepository.upsertMany(
      ghRepos.map((r) => ({ ...normalizeRepository(r), installation_id: installation.id })),
    );
    repositoryIds.push(...stored.map((r) => r.id));
  }

  await accessRepository.replaceUserInstallations(userId, installationIds);
  await accessRepository.replaceUserRepositories(userId, repositoryIds);

  return { installations: installationIds.length, repositories: repositoryIds.length };
}
