import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  createAttempt,
  getAttemptSnapshot,
  getMissions,
  getXp,
  LevelProgress,
  MissionPeriod,
  MissionsResponse,
  PlayerXp,
  refreshMission,
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

/** Inner tabs of the Profile page; the choice is kept in ?tab= so Back returns to it. */
const PROFILE_TABS = [
  { id: "missions", label: "Missions" },
  { id: "player", label: "Player" },
  { id: "achievements", label: "Achievements" },
] as const;
type ProfileTab = (typeof PROFILE_TABS)[number]["id"];

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
  const [setBonusXp, setSetBonusXp] = useState<Record<MissionPeriod, number> | null>(null);
  const [xp, setXp] = useState<PlayerXp | null>(null);
  const [xpError, setXpError] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: ProfileTab = PROFILE_TABS.some((t) => t.id === tabParam) ? (tabParam as ProfileTab) : "missions";

  const onMissions = (res: MissionsResponse) => {
    setMissions(res.missions);
    setSetBonusXp(res.setBonusXp);
  };

  useEffect(() => {
    // Missions first: loading them settles completions that XP then counts.
    getMissions(HARDCODED_PLAYER_ID)
      .then(onMissions)
      .catch((err) => setMissionsError(err.message))
      .finally(() =>
        getXp(HARDCODED_PLAYER_ID)
          .then(setXp)
          .catch((err) => setXpError(err.message))
      );
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
  const solvedCount = questionStats.reduce((n, s) => n + Number(s.solved), 0);
  const triedCount = questionStats.reduce((n, s) => n + Number(s.tried), 0);

  return (
    <div>
      <h1>{playerName}</h1>

      <LevelSection xp={xp} error={xpError} />

      <div role="tablist" style={{ display: "flex", gap: "0.25rem", borderBottom: "1px solid #ddd", marginBottom: "1rem" }}>
        {PROFILE_TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setSearchParams(t.id === "missions" ? {} : { tab: t.id }, { replace: true })}
            style={{
              padding: "0.5rem 1rem",
              border: "none",
              borderBottom: `3px solid ${tab === t.id ? "#2196f3" : "transparent"}`,
              background: "none",
              fontWeight: tab === t.id ? 700 : 400,
              color: tab === t.id ? "#000" : "#666",
              cursor: "pointer",
              marginBottom: -1,
            }}
          >
            {t.id === "achievements" ? `${t.label} (${unlockedCount} / ${achievements.length})` : t.label}
          </button>
        ))}
      </div>

      {tab === "missions" && (
        <MissionsSection missions={missions} error={missionsError} onMissions={onMissions} setBonusXp={setBonusXp} />
      )}

      {tab === "player" && (<>
      <MasterySection xp={xp} />

      <p style={{ fontSize: "1.1rem" }}>
        <strong>{solvedCount}</strong> puzzles solved
        <span style={{ color: "#666" }}> · {triedCount} tried, unsolved</span>
      </p>

      <h2>Activity</h2>
      <ActivityHeatmap
        player={HARDCODED_PLAYER_ID}
        typeLabels={Object.fromEntries(questionStats.map((s) => [s.typeId, s.typeJpLabel]))}
      />
      </>)}

      {tab === "achievements" && (<>
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
      </>)}

      {tab === "player" && (<>
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
      </>)}
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

const XP_COLOR = "#7e57c2";

function LevelBar({ p, xp, height = 10 }: { p: LevelProgress; xp: number; height?: number }) {
  const pct = Math.min(100, Math.round((100 * (xp - p.levelStartXp)) / (p.nextLevelXp - p.levelStartXp)));
  return (
    <div style={{ height, borderRadius: height / 2, backgroundColor: "#eee", overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", backgroundColor: XP_COLOR }} />
    </div>
  );
}

function LevelSection({ xp, error }: { xp: PlayerXp | null; error: string | null }) {
  if (error) return <p style={{ color: "red" }}>Couldn't load XP: {error}</p>;
  if (xp === null) return <p style={{ color: "#666" }}>Loading level...</p>;
  return (
    <div style={{
      display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap",
      padding: "0.75rem 1rem", border: `1px solid ${XP_COLOR}`, borderRadius: 8, marginBottom: "1rem",
    }}>
      <div style={{ fontSize: "1.6rem", fontWeight: 700, color: XP_COLOR, whiteSpace: "nowrap" }}>Lv {xp.level}</div>
      <div style={{ flex: "1 1 240px", minWidth: 0, display: "flex", flexDirection: "column", gap: "0.3rem" }}>
        <LevelBar p={xp} xp={xp.total} />
        <div style={{ fontSize: "0.85rem", color: "#555", fontVariantNumeric: "tabular-nums" }}>
          {(xp.total - xp.levelStartXp).toLocaleString()} / {(xp.nextLevelXp - xp.levelStartXp).toLocaleString()} XP to level {xp.level + 1}
          {" · "}{xp.total.toLocaleString()} XP total
          <span style={{ color: "#888" }}>
            {" "}(solves {xp.fromSolves.toLocaleString()}, missions {xp.fromMissions.toLocaleString()}, set bonuses {xp.fromSetBonuses.toLocaleString()})
          </span>
        </div>
      </div>
    </div>
  );
}

function MasterySection({ xp }: { xp: PlayerXp | null }) {
  if (xp === null || xp.mastery.length === 0) return null;
  return (
    <>
      <h2>Mastery</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "0.6rem", marginBottom: "1.5rem" }}>
        {xp.mastery.map((m) => (
          <div key={m.typeId} style={{ padding: "0.5rem 0.75rem", border: "1px solid #ddd", borderRadius: 8, display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", alignItems: "baseline" }}>
              <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.label}</strong>
              <span style={{ color: XP_COLOR, fontWeight: 700, whiteSpace: "nowrap" }}>Lv {m.level}</span>
            </div>
            <LevelBar p={m} xp={m.xp} height={6} />
            <div style={{ fontSize: "0.78rem", color: "#888", fontVariantNumeric: "tabular-nums" }}>
              {m.xp.toLocaleString()} XP · {m.solved} solved
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function MissionsSection({ missions, error, onMissions, setBonusXp }: {
  missions: Mission[] | null;
  error: string | null;
  onMissions: (res: MissionsResponse) => void;
  setBonusXp: Record<MissionPeriod, number> | null;
}) {
  const navigate = useNavigate();
  const [openError, setOpenError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<number | null>(null);

  const refresh = (m: Mission) => {
    if (!window.confirm(`Swap "${m.description}" for another? You get one swap per period.`)) return;
    setOpenError(null);
    setRefreshing(m.id);
    refreshMission(HARDCODED_PLAYER_ID, m.id)
      .then(onMissions)
      .catch((e) => setOpenError(e.message))
      .finally(() => setRefreshing(null));
  };

  if (error) return <p style={{ color: "red" }}>Couldn't load missions: {error}</p>;
  if (missions === null) return <p style={{ color: "#666" }}>Loading missions...</p>;
  if (missions.length === 0) return <p style={{ color: "#666" }}>No missions right now.</p>;

  const periods = ["day", "week", "month"].filter((p) => missions.some((m) => m.period === p));
  return (
    <>
      {openError && <p style={{ color: "red" }}>{openError}</p>}
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
              {setBonusXp && (
                <span style={{ fontWeight: "normal", fontSize: "0.85rem", color: done === group.length ? "#4caf50" : XP_COLOR }}>
                  {done === group.length ? "✓ " : ""}all done: +{setBonusXp[period as MissionPeriod]} XP
                </span>
              )}
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "0.75rem" }}>
              {group.map((m) => {
                // Assigned puzzles show how far the player has got on the board,
                // not 0 / 1; counted missions show their count.
                const fraction = m.puzzleProgress != null ? m.puzzleProgress : m.target > 0 ? m.progress / m.target : 0;
                return (
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
                    <span style={{
                      marginLeft: "auto",
                      fontSize: "0.8rem",
                      whiteSpace: "nowrap",
                      color: m.completed ? "#4caf50" : XP_COLOR,
                    }}>
                      {m.completed ? "✓ " : ""}+{m.xp} XP
                    </span>
                    {m.refreshable && (
                      <button
                        title="Swap for another (once per period)"
                        disabled={refreshing !== null}
                        onClick={() => refresh(m)}
                        style={{ padding: "0 0.4rem" }}
                      >
                        {refreshing === m.id ? "…" : "↻"}
                      </button>
                    )}
                  </div>
                  {m.questionTitle && (
                    <div style={{ fontSize: "0.85rem", color: "#555" }}>{m.questionTitle}</div>
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <div style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: "#eee", overflow: "hidden" }}>
                      <div style={{
                        width: `${Math.round(100 * fraction)}%`,
                        height: "100%",
                        backgroundColor: m.completed ? "#4caf50" : "#2196f3",
                      }} />
                    </div>
                    <span style={{ fontSize: "0.85rem", color: "#555", fontVariantNumeric: "tabular-nums" }}>
                      {m.puzzleProgress != null ? `${Math.floor(100 * m.puzzleProgress)}%` : `${m.progress} / ${m.target}`}
                    </span>
                    {m.questionId && !m.completed && (
                      <button
                        onClick={() => {
                          setOpenError(null);
                          openMissionPuzzle(m.questionId!, navigate).catch((e) => setOpenError(`Couldn't open the puzzle: ${e.message}`));
                        }}
                      >
                        Play
                      </button>
                    )}
                  </div>
                </div>
                );
              })}
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
