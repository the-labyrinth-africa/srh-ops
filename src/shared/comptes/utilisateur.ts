import type { UserRole } from "@/shared/acces/roles";

export interface IUser {
  _id: string;
  username: string;
  nom: string;
  email: string;
  role: UserRole;
  telephone?: string;
  clientId?: string;
  equipeId?: string;
  mustChangePassword?: boolean;
  createdAt?: string;
  updatedAt?: string;
}
