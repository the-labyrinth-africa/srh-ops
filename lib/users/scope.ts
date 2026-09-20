import { Client } from "@/models/Client";
import { Equipe } from "@/models/Equipe";

/** Retourne un message d'erreur si le client ou l'équipe référencés n'existent pas. */
export async function findScopeError(input: {
  clientId?: string;
  equipeId?: string;
}): Promise<string | null> {
  if (input.clientId && !(await Client.exists({ _id: input.clientId }))) {
    return "Client introuvable";
  }
  if (input.equipeId && !(await Equipe.exists({ _id: input.equipeId }))) {
    return "Équipe introuvable";
  }
  return null;
}
