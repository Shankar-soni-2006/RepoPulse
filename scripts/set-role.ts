/**
 * Set a user's RepoPulse role from the command line. Needed once to create the first
 * admin (afterwards admins manage roles on the Admin page). The user must have signed
 * in at least once.
 *
 *   npm run admin:role -- <github-login> admin|member
 */
import { userRepository } from '../backend/src/repositories/userRepository.js';
import { adminRepository } from '../backend/src/repositories/adminRepository.js';

async function main(): Promise<void> {
  const [login, role] = process.argv.slice(2);
  if (!login || (role !== 'admin' && role !== 'member')) {
    console.error('Usage: npm run admin:role -- <github-login> admin|member');
    process.exit(1);
  }
  const user = await userRepository.findByLogin(login);
  if (!user) {
    console.error(`No RepoPulse user "${login}". They need to sign in once first.`);
    process.exit(1);
  }
  await adminRepository.setRole(user.id, role);
  console.log(`${user.login} is now ${role === 'admin' ? 'an admin' : 'a member'}.`);
}

main().catch((err: unknown) => {
  console.error('Could not set role:', err instanceof Error ? err.message : err);
  process.exit(1);
});
