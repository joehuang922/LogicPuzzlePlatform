import { executeStatement } from "./db";

export interface AchievementDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: "total" | "diversity" | "type" | "difficulty" | "collection";
  evaluate: (stats: PlayerStats) => boolean;
}

export interface PlayerStats {
  totalSolved: number;
  solvedByType: Record<number, number>;
  typesWithSolves: number;
  solvedByDifficulty: Record<number, number>;
  completedCollections: number;
}

export interface UnlockedAchievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  unlockedAt: string;
}

const TYPE_MILESTONES = [1, 3, 10, 30, 50, 100, 200, 500];

const STATIC_DEFINITIONS: AchievementDefinition[] = [
  { id: "total_solved_1", name: "First Steps", description: "Solve your first puzzle", icon: "🎯", category: "total", evaluate: (s) => s.totalSolved >= 1 },
  { id: "total_solved_5", name: "Getting Started", description: "Solve 5 puzzles", icon: "⭐", category: "total", evaluate: (s) => s.totalSolved >= 5 },
  { id: "total_solved_20", name: "Dedicated", description: "Solve 20 puzzles", icon: "🌟", category: "total", evaluate: (s) => s.totalSolved >= 20 },
  { id: "total_solved_50", name: "Puzzle Master", description: "Solve 50 puzzles", icon: "🏆", category: "total", evaluate: (s) => s.totalSolved >= 50 },
  { id: "total_solved_100", name: "Century", description: "Solve 100 puzzles", icon: "💯", category: "total", evaluate: (s) => s.totalSolved >= 100 },

  { id: "type_diversity_3", name: "Explorer", description: "Solve puzzles of 3 different types", icon: "🧭", category: "diversity", evaluate: (s) => s.typesWithSolves >= 3 },
  { id: "type_diversity_5", name: "Polymath", description: "Solve puzzles of 5 different types", icon: "🎓", category: "diversity", evaluate: (s) => s.typesWithSolves >= 5 },

  { id: "difficulty_hard_1", name: "Challenger", description: "Solve a Hard+ puzzle", icon: "💪", category: "difficulty", evaluate: (s) => (s.solvedByDifficulty[4] ?? 0) + (s.solvedByDifficulty[5] ?? 0) >= 1 },
  { id: "difficulty_superhard_1", name: "Fearless", description: "Solve a Super-Hard puzzle", icon: "🔥", category: "difficulty", evaluate: (s) => (s.solvedByDifficulty[5] ?? 0) >= 1 },

  { id: "collection_complete_1", name: "Completionist", description: "Complete a collection (10+ puzzles)", icon: "📚", category: "collection", evaluate: (s) => s.completedCollections >= 1 },
  { id: "collection_complete_3", name: "Collector", description: "Complete 3 collections (10+ puzzles)", icon: "🏅", category: "collection", evaluate: (s) => s.completedCollections >= 3 },
];

function generateTypeDefinitions(
  types: { id: number; name: string }[]
): AchievementDefinition[] {
  const defs: AchievementDefinition[] = [];
  for (const t of types) {
    for (const n of TYPE_MILESTONES) {
      defs.push({
        id: `type_${t.id}_solved_${n}`,
        name: `${t.name} x${n}`,
        description: `Solve ${n} ${t.name} puzzle${n > 1 ? "s" : ""}`,
        icon: "🧩",
        category: "type",
        evaluate: (s) => (s.solvedByType[t.id] ?? 0) >= n,
      });
    }
  }
  return defs;
}

export async function getAllDefinitions(): Promise<AchievementDefinition[]> {
  const result = await executeStatement(
    `SELECT id, name FROM puzzle_types ORDER BY name`
  );
  const types = result.records.map((r) => ({
    id: r.id as number,
    name: r.name as string,
  }));
  return [...STATIC_DEFINITIONS, ...generateTypeDefinitions(types)];
}

export async function computePlayerStats(playerId: number): Promise<PlayerStats> {
  const mainResult = await executeStatement(
    `SELECT
       pq.puzzle_type AS type_id,
       pq.difficulty,
       COUNT(DISTINCT pa.question) AS cnt
     FROM player_attempt pa
     JOIN puzzle_questions pq ON pq.id = pa.question
     WHERE pa.player = :player AND pa.finished_at IS NOT NULL
     GROUP BY pq.puzzle_type, pq.difficulty`,
    [{ name: "player", value: { longValue: playerId } }]
  );

  let totalSolved = 0;
  const solvedByType: Record<number, number> = {};
  const solvedByDifficulty: Record<number, number> = {};

  for (const row of mainResult.records) {
    const count = row.cnt as number;
    const typeId = row.type_id as number;
    const diff = row.difficulty as number;
    totalSolved += count;
    solvedByType[typeId] = (solvedByType[typeId] ?? 0) + count;
    solvedByDifficulty[diff] = (solvedByDifficulty[diff] ?? 0) + count;
  }

  const collResult = await executeStatement(
    `SELECT pc.id
     FROM puzzle_collections pc
     JOIN puzzle_questions pq ON pq.src_collection = pc.id
     LEFT JOIN player_attempt pa
       ON pa.question = pq.id AND pa.player = :player AND pa.finished_at IS NOT NULL
     GROUP BY pc.id
     HAVING COUNT(pq.id) >= 10
       AND COUNT(DISTINCT pq.id) = COUNT(DISTINCT pa.question)`,
    [{ name: "player", value: { longValue: playerId } }]
  );

  return {
    totalSolved,
    solvedByType,
    typesWithSolves: Object.keys(solvedByType).length,
    solvedByDifficulty,
    completedCollections: collResult.records.length,
  };
}

export async function evaluateAndUnlock(
  playerId: number
): Promise<UnlockedAchievement[]> {
  const [definitions, stats, existingResult] = await Promise.all([
    getAllDefinitions(),
    computePlayerStats(playerId),
    executeStatement(
      `SELECT achievement_id FROM player_achievement WHERE player = :player`,
      [{ name: "player", value: { longValue: playerId } }]
    ),
  ]);

  const existingIds = new Set(
    existingResult.records.map((r) => r.achievement_id as string)
  );

  const newlyUnlocked: UnlockedAchievement[] = [];

  for (const def of definitions) {
    if (existingIds.has(def.id)) continue;
    if (!def.evaluate(stats)) continue;

    await executeStatement(
      `INSERT IGNORE INTO player_achievement (player, achievement_id) VALUES (:player, :achievementId)`,
      [
        { name: "player", value: { longValue: playerId } },
        { name: "achievementId", value: { stringValue: def.id } },
      ]
    );

    newlyUnlocked.push({
      id: def.id,
      name: def.name,
      description: def.description,
      icon: def.icon,
      category: def.category,
      unlockedAt: new Date().toISOString(),
    });
  }

  return newlyUnlocked;
}
