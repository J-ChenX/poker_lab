import DisplayClient from "./display-client";

export const dynamic = "force-dynamic";

export default async function DisplayPage() {
  let initialState = null;
  try {
    const { ensureScoreStateSchema, readScoreState } = await import("../score/state-store");
    await ensureScoreStateSchema();
    initialState = await readScoreState();
  } catch {
    // 数据库或隧道暂时不可用时，由客户端持续重试。
  }
  return <DisplayClient initialState={initialState} />;
}
