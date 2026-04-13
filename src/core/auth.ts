import bcrypt from 'bcryptjs';
import { Role } from './types.js';

export interface User {
  username: string;
  role: Role;
  passwordHash: string;
}

const ownerPassword = process.env.OWNER_PASSWORD ?? 'owner123';
const managerPassword = process.env.MANAGER_PASSWORD ?? 'manager123';

export const users: User[] = [
  { username: process.env.OWNER_USER ?? 'owner', role: 'owner', passwordHash: bcrypt.hashSync(ownerPassword, 10) },
  { username: process.env.MANAGER_USER ?? 'manager', role: 'manager', passwordHash: bcrypt.hashSync(managerPassword, 10) },
];

export async function authenticate(username: string, password: string): Promise<User | null> {
  const user = users.find((u) => u.username === username);
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  return ok ? user : null;
}
