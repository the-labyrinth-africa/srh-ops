import { NextResponse } from "next/server";

const MONGO_ID_PATTERN = /^[a-f\d]{24}$/i;

export function isValidObjectId(id: string): boolean {
  return MONGO_ID_PATTERN.test(id);
}

export type ObjectIdGuard =
  | { valid: true; id: string }
  | { valid: false; error: NextResponse };

export function guardObjectId(id: string): ObjectIdGuard {
  if (!isValidObjectId(id)) {
    return {
      valid: false,
      error: NextResponse.json(
        { error: "Identifiant invalide" },
        { status: 400 }
      ),
    };
  }
  return { valid: true, id };
}