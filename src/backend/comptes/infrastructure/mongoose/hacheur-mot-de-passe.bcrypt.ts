import bcrypt from "bcryptjs";
import type { HacheurMotDePasse } from "../../domain/ports";

export class HacheurMotDePasseBcrypt implements HacheurMotDePasse {
  async hacher(motDePasse: string): Promise<string> {
    return bcrypt.hash(motDePasse, 10);
  }
  async comparer(motDePasse: string, hash: string): Promise<boolean> {
    return bcrypt.compare(motDePasse, hash);
  }
}
