import { useEffect, useState } from "react";
import { getProfile, ProfileQuestionStat, ProfileCollectionRow, ProfileAchievement } from "../api/client";

const HARDCODED_PLAYER_ID = 1;

interface CollectionGroup {
  collectionId: number;
  collectionName: string;
  totalSolved: number;
  totalCount: number;
  types: { typeName: string; solved: number; total: number }[];
}

function groupCollectionStats(rows: ProfileCollectionRow[]): CollectionGroup[] {
  const map = new Map<number, CollectionGroup>();
  for (const row of rows) {
    let group = map.get(row.collectionId);
    if (!group) {
      group = {
        collectionId: row.collectionId,
        collectionName: row.collectionName,
        totalSolved: 0,
        totalCount: 0,
        types: [],
      };
      map.set(row.collectionId, group);
    }
    group.totalSolved += row.solved;
    group.totalCount += row.total;
    group.types.push({ typeName: row.typeName, solved: row.solved, total: row.total });
  }
  return Array.from(map.values());
}

export default function Profile() {
  const [playerName, setPlayerName] = useState<string>("");
  const [questionStats, setQuestionStats] = useState<ProfileQuestionStat[]>([]);
  const [collectionGroups, setCollectionGroups] = useState<CollectionGroup[]>([]);
  const [achievements, setAchievements] = useState<ProfileAchievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getProfile(HARDCODED_PLAYER_ID)
      .then((res) => {
        setPlayerName(res.player.name);
        setQuestionStats(res.questionStats);
        setCollectionGroups(groupCollectionStats(res.collectionStats));
        setAchievements(res.achievements);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Loading profile...</p>;
  if (error) return <p style={{ color: "red" }}>Error: {error}</p>;

  const unlockedCount = achievements.filter((a) => a.unlocked).length;

  return (
    <div>
      <h1>{playerName}</h1>

      <h2>Achievements ({unlockedCount} / {achievements.length})</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "0.75rem", marginBottom: "2rem" }}>
        {achievements.map((a) => (
          <div key={a.id} style={{
            padding: "0.75rem",
            border: "1px solid",
            borderColor: a.unlocked ? (CATEGORY_COLORS[a.category] ?? "#a5d6a7") : "#ddd",
            borderRadius: 8,
            backgroundColor: a.unlocked ? "#fff" : "#fafafa",
            opacity: a.unlocked ? 1 : 0.5,
            display: "flex",
            gap: "0.75rem",
            alignItems: "center",
          }}>
            <div style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              border: `3px solid ${a.unlocked ? (CATEGORY_COLORS[a.category] ?? "#a5d6a7") : "#ccc"}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1.5rem",
              filter: a.unlocked ? "none" : "grayscale(1)",
              flexShrink: 0,
            }}>
              {a.icon}
            </div>
            <div style={{ minWidth: 0 }}>
              <strong>{a.name}</strong>
              <div style={{ fontSize: "0.85rem", color: "#555" }}>{a.description}</div>
              {a.unlockedAt && (
                <div style={{ fontSize: "0.8rem", color: "#888", marginTop: "0.15rem" }}>
                  Unlocked: {new Date(a.unlockedAt).toLocaleDateString()}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <h2>Question Stats</h2>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th style={thStyle}>Puzzle Type</th>
            <th style={thStyle}>Solved</th>
            <th style={thStyle}>Tried (unsolved)</th>
            <th style={thStyle}>Total</th>
          </tr>
        </thead>
        <tbody>
          {questionStats.map((s) => (
            <tr key={s.typeId}>
              <td style={tdStyle}>{s.typeName}</td>
              <td style={tdStyle}>{s.solved}</td>
              <td style={tdStyle}>{s.tried}</td>
              <td style={tdStyle}>{s.total}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Collection Stats</h2>
      {collectionGroups.length === 0 ? (
        <p style={{ color: "#666" }}>No collections found.</p>
      ) : (
        collectionGroups.map((cg) => (
          <div key={cg.collectionId} style={{ marginBottom: "1.5rem" }}>
            <h3 style={{ marginBottom: "0.25rem" }}>
              {cg.collectionName}{" "}
              <span style={{ fontWeight: "normal", fontSize: "0.9rem", color: "#555" }}>
                ({cg.totalSolved} / {cg.totalCount})
              </span>
            </h3>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  <th style={thStyle}>Type</th>
                  <th style={thStyle}>Progress</th>
                </tr>
              </thead>
              <tbody>
                {cg.types.map((t) => (
                  <tr key={t.typeName}>
                    <td style={tdStyle}>{t.typeName}</td>
                    <td style={tdStyle}>{t.solved} / {t.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
    </div>
  );
}

const CATEGORY_COLORS: Record<string, string> = {
  total: "#ffc107",
  diversity: "#2196f3",
  type: "#4caf50",
  difficulty: "#f44336",
  collection: "#9c27b0",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  borderBottom: "2px solid #ddd",
  padding: "0.5rem",
};

const tdStyle: React.CSSProperties = {
  padding: "0.5rem",
  borderBottom: "1px solid #eee",
};
