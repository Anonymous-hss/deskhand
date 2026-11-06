import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { STATE_DIR } from '../state/taskRepository.js';
import type { TeamRole } from '@deskhand/shared-protocol';
export interface Principal { id: string; name: string; role: TeamRole; kind: 'operator' | 'bridge' | 'phone'; token: string }
export class OperatorAuth {
  private principals: Principal[];
  private file: string;
  private codes = new Map<string, number>();
  private attempts = new Map<string, { count: number; expires: number }>();
  constructor(directory = STATE_DIR) {
    fs.mkdirSync(directory, { recursive: true }); this.file = path.join(directory, 'client-credentials.json');
    if (fs.existsSync(this.file)) this.principals = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    else {
      this.principals = [
        { id: 'local-operator', name: 'Local operator', role: 'admin', kind: 'operator', token: crypto.randomBytes(32).toString('hex') },
        { id: 'switch-coordinator', name: 'Switch coordinator', role: 'viewer', kind: 'bridge', token: crypto.randomBytes(32).toString('hex') }
      ]; this.save();
    }
  }
  private save() { fs.writeFileSync(this.file, JSON.stringify(this.principals, null, 2), { mode: 0o600 }); }
  authenticate(header?: string): Principal | undefined {
    if (!header?.startsWith('Bearer ')) return;
    const token = Buffer.from(header.slice(7));
    return this.principals.find(principal => { const expected = Buffer.from(principal.token); return token.length === expected.length && crypto.timingSafeEqual(token, expected); });
  }
  issueCode(): { code: string; expiresAt: string } {
    const code = String(crypto.randomInt(10000000, 100000000));
    const expires = Date.now() + 300000;
    this.codes.clear(); this.codes.set(code, expires);
    return { code, expiresAt: new Date(expires).toISOString() };
  }
  pair(code: string, address: string): Principal {
    let attempt = this.attempts.get(address);
    if (!attempt || attempt.expires < Date.now()) { attempt = { count: 0, expires: Date.now() + 300000 }; this.attempts.set(address, attempt); }
    if (++attempt.count > 10) throw new Error('Too many pairing attempts. Wait five minutes.');
    const expires = this.codes.get(code);
    if (!expires || expires < Date.now()) throw new Error('Pairing code is invalid or expired. Generate a new code in Studio.');
    this.codes.delete(code);
    const principal: Principal = { id: 'phone-' + crypto.randomUUID(), name: 'Paired iPhone operator', role: 'ops-lead', kind: 'phone', token: crypto.randomBytes(32).toString('hex') };
    this.principals.push(principal); this.save();
    return principal;
  }
  canApprove(principal?: Principal) { return principal && principal.kind !== 'bridge' && ['admin', 'ops-lead', 'qa-lead'].includes(principal.role); }
}
