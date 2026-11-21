import { db, isSqlConfigured } from "./index.ts";
import { projects, userSettings } from "./schema.ts";
import { eq, desc } from "drizzle-orm";

// In-memory fallback store when Cloud SQL is not configured
const memoryProjects = new Map<string, any>();
const memorySettings = new Map<string, any>();

export async function listProjectsSql(userId?: string) {
  if (!isSqlConfigured()) {
    return Array.from(memoryProjects.values()).sort(
      (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)
    );
  }
  try {
    const rows = await db
      .select({
        id: projects.id,
        name: projects.name,
        thumb: projects.thumb,
        durationSec: projects.durationSec,
        clipCount: projects.clipCount,
        niche: projects.niche,
        currentStage: projects.currentStage,
        progressPct: projects.progressPct,
        status: projects.status,
        archived: projects.archived,
        createdAt: projects.createdAt,
        updatedAt: projects.updatedAt,
      })
      .from(projects)
      .orderBy(desc(projects.updatedAt));

    return rows.map((r) => ({
      ...r,
      createdAt: r.createdAt ? new Date(r.createdAt).getTime() : Date.now(),
      updatedAt: r.updatedAt ? new Date(r.updatedAt).getTime() : Date.now(),
      archived: !!r.archived,
    }));
  } catch (err) {
    console.warn("Cloud SQL listProjects fallback to memory:", (err as Error)?.message);
    return Array.from(memoryProjects.values()).sort(
      (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)
    );
  }
}

export async function getProjectSql(id: string) {
  if (!isSqlConfigured()) {
    return memoryProjects.get(id) || null;
  }
  try {
    const rows = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
    if (!rows.length) return memoryProjects.get(id) || null;
    const r = rows[0];
    let parsedData = {};
    try {
      parsedData = JSON.parse(r.data);
    } catch {}

    return {
      id: r.id,
      name: r.name,
      thumb: r.thumb,
      durationSec: r.durationSec,
      clipCount: r.clipCount,
      niche: r.niche,
      currentStage: r.currentStage,
      progressPct: r.progressPct,
      status: r.status,
      archived: !!r.archived,
      data: parsedData,
      createdAt: r.createdAt ? new Date(r.createdAt).getTime() : Date.now(),
      updatedAt: r.updatedAt ? new Date(r.updatedAt).getTime() : Date.now(),
    };
  } catch (err) {
    console.warn(`Cloud SQL getProject(${id}) fallback to memory:`, (err as Error)?.message);
    return memoryProjects.get(id) || null;
  }
}

export async function saveProjectSql(record: any, userId?: string) {
  const now = new Date();
  const dataStr = typeof record.data === "string" ? record.data : JSON.stringify(record.data || {});
  const np = record.data?.narrative;

  const toSafeInt = (val: any, fallback = 0): number => {
    const n = Math.round(Number(val));
    return Number.isFinite(n) ? n : fallback;
  };

  const values = {
    id: String(record.id),
    userId: userId || record.userId || null,
    name: String(record.name || "Untitled Project"),
    thumb: record.thumb || (np && np.reference && np.reference.thumbnailUrl) || null,
    durationSec: toSafeInt(record.durationSec || (np && np.actualDurationSec), 0),
    clipCount: toSafeInt(record.clipCount || (np && np.scenes ? np.scenes.length : 0), 0),
    niche: String(record.niche || (np && np.selectedConcept && np.selectedConcept.niche) || "Documentary"),
    currentStage: toSafeInt(record.currentStage || (np && np.currentStage), 1),
    progressPct: toSafeInt(record.progressPct != null ? record.progressPct : (np && np.progressPct != null ? np.progressPct : 0), 0),
    status: String(record.status || (np && np.status) || "Draft"),
    archived: Boolean(record.archived),
    data: dataStr,
    createdAt: record.createdAt ? new Date(record.createdAt) : now,
    updatedAt: now,
  };

  const savedRecord = {
    ...record,
    id: values.id,
    name: values.name,
    thumb: values.thumb,
    durationSec: values.durationSec,
    clipCount: values.clipCount,
    niche: values.niche,
    currentStage: values.currentStage,
    progressPct: values.progressPct,
    status: values.status,
    archived: values.archived,
    createdAt: values.createdAt.getTime(),
    updatedAt: now.getTime(),
  };

  memoryProjects.set(values.id, savedRecord);

  if (!isSqlConfigured()) {
    return savedRecord;
  }

  try {
    await db
      .insert(projects)
      .values(values)
      .onConflictDoUpdate({
        target: projects.id,
        set: {
          name: values.name,
          thumb: values.thumb,
          durationSec: values.durationSec,
          clipCount: values.clipCount,
          niche: values.niche,
          currentStage: values.currentStage,
          progressPct: values.progressPct,
          status: values.status,
          archived: values.archived,
          data: values.data,
          updatedAt: now,
        },
      });

    return savedRecord;
  } catch (err) {
    console.warn("Cloud SQL saveProject fallback to memory:", (err as Error)?.message);
    return savedRecord;
  }
}

export async function renameProjectSql(id: string, name: string) {
  const now = new Date();
  const existing = memoryProjects.get(id);
  if (existing) {
    existing.name = name;
    existing.updatedAt = now.getTime();
    memoryProjects.set(id, existing);
  }
  if (!isSqlConfigured()) {
    return { id, name, updatedAt: now.getTime() };
  }
  try {
    await db.update(projects).set({ name, updatedAt: now }).where(eq(projects.id, id));
    return { id, name, updatedAt: now.getTime() };
  } catch (err) {
    console.warn(`Cloud SQL renameProject(${id}) fallback to memory:`, (err as Error)?.message);
    return { id, name, updatedAt: now.getTime() };
  }
}

export async function archiveProjectSql(id: string, archived = true) {
  const now = new Date();
  const existing = memoryProjects.get(id);
  if (existing) {
    existing.archived = archived;
    existing.updatedAt = now.getTime();
    memoryProjects.set(id, existing);
  }
  if (!isSqlConfigured()) {
    return { id, archived, updatedAt: now.getTime() };
  }
  try {
    await db.update(projects).set({ archived, updatedAt: now }).where(eq(projects.id, id));
    return { id, archived, updatedAt: now.getTime() };
  } catch (err) {
    console.warn(`Cloud SQL archiveProject(${id}) fallback to memory:`, (err as Error)?.message);
    return { id, archived, updatedAt: now.getTime() };
  }
}

export async function duplicateProjectSql(id: string) {
  try {
    const original = await getProjectSql(id);
    if (!original) return null;
    const newId = "p_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    const cloned = {
      ...original,
      id: newId,
      name: `${original.name} (Copy)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await saveProjectSql(cloned);
    return cloned;
  } catch (err) {
    console.warn(`Cloud SQL duplicateProject(${id}) failed:`, (err as Error)?.message);
    return null;
  }
}

export async function deleteProjectSql(id: string) {
  memoryProjects.delete(id);
  if (!isSqlConfigured()) {
    return true;
  }
  try {
    await db.delete(projects).where(eq(projects.id, id));
    return true;
  } catch (err) {
    console.warn(`Cloud SQL deleteProject(${id}) fallback to memory:`, (err as Error)?.message);
    return true;
  }
}

export async function getGlobalSettingsSql(userId?: string) {
  const key = userId ? `settings_${userId}` : "production_settings";
  if (!isSqlConfigured()) {
    return memorySettings.get(key) || null;
  }
  try {
    const rows = await db.select().from(userSettings).where(eq(userSettings.id, key)).limit(1);
    if (!rows.length) return memorySettings.get(key) || null;
    return JSON.parse(rows[0].data);
  } catch {
    return memorySettings.get(key) || null;
  }
}

export async function saveGlobalSettingsSql(settings: any, userId?: string) {
  const key = userId ? `settings_${userId}` : "production_settings";
  memorySettings.set(key, settings);
  if (!isSqlConfigured()) {
    return settings;
  }
  try {
    const dataStr = JSON.stringify(settings || {});
    await db
      .insert(userSettings)
      .values({
        id: key,
        userId: userId || null,
        data: dataStr,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userSettings.id,
        set: {
          data: dataStr,
          updatedAt: new Date(),
        },
      });
    return settings;
  } catch (err) {
    console.warn("Cloud SQL saveGlobalSettings fallback to memory:", (err as Error)?.message);
    return settings;
  }
}

