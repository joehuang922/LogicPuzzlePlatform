import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createAttempt,
  getAttemptSnapshot,
  getMissions,
  getProfile,
  getPuzzle,
  listAttempts,
  Mission,
  ProfileAchievement,
  ProfileCollectionRow,
  ProfileQuestionStat,
} from "../api/client";
import { extractAnswer } from "../extractors";
import { PuzzleDefinition } from "../types/puzzle";
import ActivityHeatmap from "../components/ActivityHeatmap";

const HARDCODED_PLAYER_ID = 1;

interface CollectionGroup {
  collectionId: number;
  collectionName: string;
  totalSolved: number;
  totalCount: number;
  types: { typeName: string; typeJpLabel: string; solved: number; total: number }[];
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
    group.types.push({ typeName: row.typeName, typeJpLabel: row.typeJpLabel, solved: row.solved, total: row.total });
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
  const [missions, setMissions] = useState<Mission[] | null>(null);
  const [missionsError, setMissionsError] = useState<string | null>(null);

  useEffect(() => {
    getMissions(HARDCODED_PLAYER_ID)
      .then((res) => setMissions(res.missions))
      .catch((err) => setMissionsError(err.message));
  }, []);

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

      <MissionsSection missions={missions} error={missionsError} />

      <h2>Activity</h2>
      <ActivityHeatmap
        player={HARDCODED_PLAYER_ID}
        typeLabels={Object.fromEntries(questionStats.map((s) => [s.typeId, s.typeJpLabel]))}
      />

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
              <td style={tdStyle}>{s.typeJpLabel}</td>
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
                    <td style={tdStyle}>{t.typeJpLabel}</td>
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

const PERIOD_LABELS: Record<string, string> = {
  day: "Today",
  week: "This week",
  month: "This month",
};

const SIZE_COLORS: Record<string, string> = { BIG: "#ef6c00", GIANT: "#c62828" };

/** "3 h left" / "2 d left" until a mission's period ends. */
function timeLeft(endsAt: string): string {
  const ms = Date.parse(endsAt) - Date.now();
  if (ms <= 0) return "ended";
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return `${Math.max(1, Math.floor(ms / 60_000))} min left`;
  if (h < 48) return `${h} h left`;
  return `${Math.floor(h / 24)} d left`;
}

/**
 * Open an assigned mission puzzle: resume its latest attempt, else start one.
 * Same as Home's New Attempt / Load Attempt.
 */
async function openMissionPuzzle(questionId: string, navigate: ReturnType<typeof useNavigate>) {
  const { attempts } = await listAttempts(HARDCODED_PLAYER_ID, questionId);
  const latest = [...attempts].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (latest) {
    const { snapshot } = await getAttemptSnapshot(latest.id);
    navigate(`/play/${questionId}?attempt=${latest.id}`, {
      state: {
        currentAnswer: typeof snapshot.currentAnswer === "string"
          ? JSON.parse(snapshot.currentAnswer)
          : snapshot.currentAnswer,
        elapsedSeconds: snapshot.elapsedSeconds,
      },
    });
    return;
  }
  const { puzzle } = await getPuzzle(questionId);
  const result = await createAttempt({
    player: HARDCODED_PLAYER_ID,
    question: questionId,
    initialAnswer: extractAnswer(puzzle as PuzzleDefinition, {}),
  });
  navigate(`/play/${questionId}?attempt=${result.attemptId}`);
}

function MissionsSection({ missions, error }: { missions: Mission[] | null; error: string | null }) {
  const navigate = useNavigate();
  const [openError, setOpenError] = useState<string | null>(null);

  if (error) return (<><h2>Missions</h2><p style={{ color: "red" }}>Couldn't load missions: {error}</p></>);
  if (missions === null) return (<><h2>Missions</h2><p style={{ color: "#666" }}>Loading missions...</p></>);
  if (missions.length === 0) return (<><h2>Missions</h2><p style={{ color: "#666" }}>No missions right now.</p></>);

  const periods = ["day", "week", "month"].filter((p) => missions.some((m) => m.period === p));
  return (
    <>
      <h2>Missions</h2>
      {openError && <p style={{ color: "red" }}>Couldn't open the puzzle: {openError}</p>}
      {periods.map((period) => {
        const group = missions.filter((m) => m.period === period);
        const done = group.filter((m) => m.completed).length;
        return (
          <div key={period} style={{ marginBottom: "1.25rem" }}>
            <h3 style={{ margin: "0 0 0.5rem", display: "flex", gap: "0.75rem", alignItems: "baseline" }}>
              {PERIOD_LABELS[period]}
              <span style={{ fontWeight: "normal", fontSize: "0.85rem", color: "#888" }}>
                {done} / {group.length} done · {timeLeft(group[0].endsAt)}
              </span>
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "0.75rem" }}>
              {group.map((m) => (
                <div key={m.id} style={{
                  padding: "0.75rem",
                  border: "1px solid",
                  borderColor: m.completed ? "#4caf50" : "#ddd",
                  borderRadius: 8,
                  backgroundColor: m.completed ? "#f1f8e9" : "#fff",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.4rem",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 600 }}>
                    {m.size && (
                      <span style={{
                        fontSize: "0.7rem",
                        fontWeight: 700,
                        color: "#fff",
                        backgroundColor: SIZE_COLORS[m.size] ?? "#888",
                        borderRadius: 4,
                        padding: "0.05rem 0.35rem",
                      }}>{m.size}</span>
                    )}
                    <span>{m.description}</span>
                    {m.completed && <span style={{ marginLeft: "auto", color: "#4caf50" }}>✓</span>}
                  </div>
                  {m.questionTitle && (
                    <div style={{ fontSize: "0.85rem", color: "#555" }}>{m.questionTitle}</div>
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <div style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: "#eee", overflow: "hidden" }}>
                      <div style={{
                        width: `${Math.round((100 * m.progress) / m.target)}%`,
                        height: "100%",
                        backgroundColor: m.completed ? "#4caf50" : "#2196f3",
                      }} />
                    </div>
                    <span style={{ fontSize: "0.85rem", color: "#555", fontVariantNumeric: "tabular-nums" }}>
                      {m.progress} / {m.target}
                    </span>
                    {m.questionId && !m.completed && (
                      <button
                        onClick={() => {
                          setOpenError(null);
                          openMissionPuzzle(m.questionId!, navigate).catch((e) => setOpenError(e.message));
                        }}
                      >
                        Play
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </>
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
