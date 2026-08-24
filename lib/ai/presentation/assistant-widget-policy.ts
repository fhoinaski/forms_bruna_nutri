/**
 * The daily briefing is useful on the operational dashboard, but clinical
 * screens must remain immediately navigable. The assistant is still present
 * there and can always be opened explicitly by the nutritionist.
 */
export function shouldAutoOpenDailyBriefing(currentPage: string): boolean {
  return currentPage === "dashboard";
}
