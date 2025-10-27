import "server-only";

import { eq, inArray, or } from "drizzle-orm";

import { getDB } from "@/db";
import { translationGlossaryTable } from "@/db/schema";

export interface GlossaryOption {
  id: string;
  name: string;
  sourceLanguage: string;
  targetLanguage: string;
}

export async function listAccessibleGlossaries(userId: string, teamIds: string[] = []) {
  try {
    const db = getDB();

    const filters = [
      eq(translationGlossaryTable.userId, userId),
    ];

    if (teamIds.length > 0) {
      filters.push(inArray(translationGlossaryTable.teamId, teamIds));
    }

    const results = await db
      .select({
        id: translationGlossaryTable.id,
        name: translationGlossaryTable.name,
        sourceLanguage: translationGlossaryTable.sourceLanguage,
        targetLanguage: translationGlossaryTable.targetLanguage,
      })
      .from(translationGlossaryTable)
      .where(filters.length === 1 ? filters[0] : or(...filters))
      .orderBy(translationGlossaryTable.name);

    return results satisfies GlossaryOption[];
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[glossaries] Failed to load glossaries:", error);
    }
    return [];
  }
}
