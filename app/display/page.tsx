import DisplayClient from "./display-client";

export const dynamic = "force-dynamic";

export default async function DisplayPage() {
  let initialState = null;
  try {
    const { ensureScoreStateSchema, readScoreState } = await import("../score/state-store");
    await ensureScoreStateSchema();
    initialState = await readScoreState();
  } catch {
    // The client keeps retrying when the database or tunnel is temporarily unavailable.
  }
  return <DisplayClient initialState={initialState} />;
}
