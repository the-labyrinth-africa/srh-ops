import mongoose from "mongoose";
import { connectDB } from "@/backend/platform/base-de-donnees/connexion";
import type {
  EmailNotification,
  NotificationJob,
  OperationNotification,
  OperationNotificationInfo,
} from "../../domain/notification";
import type { NotificationRepository } from "../../domain/ports";
import { NotificationJobModel, type INotificationJob } from "./notification-job.model";

interface OperationDocument {
  _id: unknown;
  clientId?: { _id?: unknown; nom?: string } | unknown;
  natureIntervention: string;
  dateHeurePrevue: Date;
  statut: string;
}

interface UserDocument {
  email: string;
  clientId?: unknown;
}

function mapOperation(doc: OperationDocument, clientEmails: string[]): OperationNotification {
  const client = doc.clientId && typeof doc.clientId === "object" && "_id" in doc.clientId
    ? doc.clientId as { _id: unknown }
    : null;
  return {
    id: String(doc._id),
    clientId: client ? String(client._id) : String(doc.clientId ?? ""),
    natureIntervention: doc.natureIntervention,
    dateHeurePrevue: new Date(doc.dateHeurePrevue),
    statut: doc.statut,
    clientEmails,
  };
}

function mapJob(doc: INotificationJob): NotificationJob {
  return {
    id: String(doc._id),
    to: doc.to,
    subject: doc.subject,
    text: doc.text,
    attempts: doc.attempts,
  };
}

export class NotificationRepositoryMongoose implements NotificationRepository {
  async enqueue(key: string, message: EmailNotification, now: Date): Promise<boolean> {
    await connectDB();
    await NotificationJobModel.init();
    const resultat = await NotificationJobModel.updateOne(
      { key },
      { $setOnInsert: { ...message, key, status: "pending", attempts: 0, nextAttemptAt: now } },
      { upsert: true }
    );
    return resultat.upsertedCount === 1;
  }

  async claim(now: Date, staleBefore: Date): Promise<NotificationJob | null> {
    await connectDB();
    const doc = await NotificationJobModel.findOneAndUpdate(
      {
        $or: [
          { status: "pending", nextAttemptAt: { $lte: now } },
          { status: "processing", lockedAt: { $lte: staleBefore } },
        ],
      },
      { $set: { status: "processing", lockedAt: now }, $inc: { attempts: 1 } },
      { new: true, sort: { createdAt: 1 } }
    ).lean<INotificationJob>();
    return doc ? mapJob(doc) : null;
  }

  async markSent(id: string, now: Date, expiresAt: Date): Promise<void> {
    await connectDB();
    await NotificationJobModel.updateOne(
      { _id: id, status: "processing" },
      { $set: { status: "sent", sentAt: now, expiresAt }, $unset: { lockedAt: 1, lastError: 1 } }
    );
  }

  async markRetry(id: string, attempts: number, reason: string, retryAt: Date, expiresAt: Date): Promise<void> {
    await connectDB();
    const failed = attempts >= 8;
    await NotificationJobModel.updateOne(
      { _id: id, status: "processing" },
      {
        $set: {
          status: failed ? "failed" : "pending",
          lastError: reason.slice(0, 80),
          nextAttemptAt: retryAt,
          ...(failed ? { expiresAt } : {}),
        },
        $unset: { lockedAt: 1 },
      }
    );
    if (failed) console.error(`[notifications] Échec définitif de livraison du job ${id} après ${attempts} tentatives.`);
  }

  async emailsInternes(): Promise<string[]> {
    await connectDB();
    const utilisateurs = (await mongoose
      .model("User")
      .find({ role: { $in: ["admin", "dispatcher"] }, email: { $type: "string", $ne: "" } })
      .select("email")
      .lean()) as unknown as UserDocument[];
    return [...new Set(utilisateurs.map((utilisateur) => utilisateur.email.trim().toLowerCase()).filter(Boolean))];
  }

  async operationInfo(id: string): Promise<OperationNotificationInfo | null> {
    await connectDB();
    const operation = (await mongoose
      .model("Operation")
      .findById(id)
      .select("clientId natureIntervention dateHeurePrevue")
      .lean()) as unknown as OperationDocument | null;
    if (!operation) return null;
    const clientId = operation.clientId && typeof operation.clientId === "object" && "_id" in operation.clientId
      ? String((operation.clientId as { _id: unknown })._id)
      : String(operation.clientId ?? "");
    return { ...mapOperation(operation, await this.emailsClients([clientId])) };
  }

  async operationsProchaines(debut: Date, fin: Date): Promise<OperationNotification[]> {
    await connectDB();
    const documents = (await mongoose
      .model("Operation")
      .find({
        dateHeurePrevue: { $gte: debut, $lte: fin },
        statut: { $in: ["Planifiée", "Affectée"] },
      })
      .select("clientId natureIntervention dateHeurePrevue statut")
      .lean()) as unknown as OperationDocument[];
    return this.mapAvecEmailsClient(documents);
  }

  async operationsEnRetard(avant: Date): Promise<OperationNotification[]> {
    await connectDB();
    const documents = (await mongoose
      .model("Operation")
      .find({
        dateHeurePrevue: { $lt: avant },
        statut: { $nin: ["Demande", "Terminée", "Rapportée", "Annulée"] },
      })
      .select("clientId natureIntervention dateHeurePrevue statut")
      .lean()) as unknown as OperationDocument[];
    return this.mapAvecEmailsClient(documents);
  }

  private async mapAvecEmailsClient(documents: OperationDocument[]): Promise<OperationNotification[]> {
    const clientIds = documents.map((document) => {
      const client = document.clientId && typeof document.clientId === "object" && "_id" in document.clientId
        ? document.clientId as { _id: unknown }
        : null;
      return client ? String(client._id) : String(document.clientId ?? "");
    }).filter(Boolean);
    const groupes = await this.emailsParClient(clientIds);
    return documents.map((document) => {
      const client = document.clientId && typeof document.clientId === "object" && "_id" in document.clientId
        ? document.clientId as { _id: unknown }
        : null;
      const clientId = client ? String(client._id) : String(document.clientId ?? "");
      return mapOperation(document, groupes.get(clientId) ?? []);
    });
  }

  private async emailsClients(clientIds: string[]): Promise<string[]> {
    const groupes = await this.emailsParClient(clientIds);
    return [...new Set(clientIds.flatMap((clientId) => groupes.get(clientId) ?? []))];
  }

  private async emailsParClient(clientIds: string[]): Promise<Map<string, string[]>> {
    const ids = [...new Set(clientIds)].filter((id) => mongoose.isValidObjectId(id));
    if (ids.length === 0) return new Map();
    const utilisateurs = (await mongoose
      .model("User")
      .find({
        role: "client",
        clientId: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) },
        email: { $type: "string", $ne: "" },
      })
      .select("clientId email")
      .lean()) as unknown as UserDocument[];
    const groupes = new Map<string, string[]>();
    for (const utilisateur of utilisateurs) {
      if (!utilisateur.clientId) continue;
      const clientId = String(utilisateur.clientId);
      const adresses = groupes.get(clientId) ?? [];
      adresses.push(utilisateur.email.trim().toLowerCase());
      groupes.set(clientId, adresses);
    }
    for (const [clientId, adresses] of groupes) groupes.set(clientId, [...new Set(adresses)]);
    return groupes;
  }
}
